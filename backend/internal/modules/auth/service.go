package auth

import (
	"context"
	"fmt"
	"net/mail"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
	"github.com/ziond/kalshi-for-friends/backend/internal/modules/users"
)

const (
	passwordMinLen = 8
	passwordMaxLen = 72 // bcrypt ignores bytes beyond 72
	emailMaxLen    = 255
)

type Service struct {
	pool           *pgxpool.Pool
	initialBalance int64
	// dummyHash keeps login timing similar whether or not the email exists.
	dummyHash []byte
}

func NewService(pool *pgxpool.Pool, initialBalance int64) *Service {
	dummy, _ := bcrypt.GenerateFromPassword([]byte("timing-equalizer"), bcrypt.DefaultCost)
	return &Service{pool: pool, initialBalance: initialBalance, dummyHash: dummy}
}

// Register creates the user, their wallet, and the INITIAL_BONUS ledger
// entry in one transaction, then returns the Me view.
func (s *Service) Register(ctx context.Context, req RegisterRequest) (*users.Me, error) {
	username := strings.TrimSpace(req.Username)
	email := strings.ToLower(strings.TrimSpace(req.Email))

	fields := map[string]string{}
	if msg := users.ValidateUsername(username); msg != "" {
		fields["username"] = msg
	}
	if msg := validateEmail(email); msg != "" {
		fields["email"] = msg
	}
	if len(req.Password) < passwordMinLen || len(req.Password) > passwordMaxLen {
		fields["password"] = fmt.Sprintf("Password must be %d–%d characters", passwordMinLen, passwordMaxLen)
	}
	if len(fields) > 0 {
		return nil, apperror.Validation("Invalid registration details", fields)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("auth: hash password: %w", err)
	}

	var me *users.Me
	err = database.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		userID, err := insertUser(ctx, tx, username, email, string(hash))
		if err != nil {
			return err
		}
		if err := openWalletWithInitialBonus(ctx, tx, userID, s.initialBalance); err != nil {
			return err
		}
		me, err = users.GetMe(ctx, tx, userID)
		return err
	})
	if name, ok := database.UniqueViolation(err); ok {
		switch name {
		case users.UsernameUniqueIndex:
			return nil, apperror.Validation("Invalid registration details", map[string]string{"username": "Username is already taken"})
		case users.EmailUniqueIndex:
			return nil, apperror.Validation("Invalid registration details", map[string]string{"email": "Email is already registered"})
		}
	}
	if err != nil {
		return nil, fmt.Errorf("auth: register: %w", err)
	}
	return me, nil
}

// Login returns the Me view when the email and password match.
func (s *Service) Login(ctx context.Context, req LoginRequest) (*users.Me, error) {
	invalid := apperror.Unauthorized("Invalid email or password")
	email := strings.TrimSpace(req.Email)
	if email == "" || req.Password == "" || len(req.Password) > passwordMaxLen {
		return nil, invalid
	}

	userID, hash, err := findCredentialsByEmail(ctx, s.pool, email)
	if database.IsNoRows(err) {
		_ = bcrypt.CompareHashAndPassword(s.dummyHash, []byte(req.Password))
		return nil, invalid
	}
	if err != nil {
		return nil, fmt.Errorf("auth: login: %w", err)
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		return nil, invalid
	}

	me, err := users.GetMe(ctx, s.pool, userID)
	if err != nil {
		return nil, fmt.Errorf("auth: load me: %w", err)
	}
	return me, nil
}

func validateEmail(email string) string {
	if email == "" || len(email) > emailMaxLen {
		return "Enter a valid email address"
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email || addr.Name != "" {
		return "Enter a valid email address"
	}
	return ""
}
