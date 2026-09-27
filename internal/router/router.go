// Package router assembles the Fiber app and registers the API routes.
package router

import (
	"context"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ziond/kalshi-for-friends/backend/internal/config"
	"github.com/ziond/kalshi-for-friends/backend/internal/middleware"
	"github.com/ziond/kalshi-for-friends/backend/internal/modules/auth"
	"github.com/ziond/kalshi-for-friends/backend/internal/modules/communities"
	"github.com/ziond/kalshi-for-friends/backend/internal/modules/markets"
	"github.com/ziond/kalshi-for-friends/backend/internal/modules/points"
	"github.com/ziond/kalshi-for-friends/backend/internal/modules/users"
)

func New(cfg *config.Config, pool *pgxpool.Pool) *fiber.App {
	app := fiber.New(fiber.Config{
		AppName:      "oracle-api",
		ErrorHandler: middleware.ErrorHandler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	})
	app.Use(recover.New())
	app.Use(middleware.RequestSecurity(cfg.CORSOrigins))
	if cfg.Env != "test" {
		app.Use(logger.New())
	}
	if len(cfg.CORSOrigins) > 0 {
		app.Use(cors.New(cors.Config{
			AllowOrigins:     strings.Join(cfg.CORSOrigins, ","),
			AllowCredentials: true,
			AllowMethods:     "GET,POST,PATCH,DELETE,OPTIONS",
			AllowHeaders:     "Content-Type",
		}))
	}

	requireAuth := middleware.RequireAuth("access_token", auth.NewVerifier(cfg))

	authHandler := auth.NewHandler(auth.NewService(pool, cfg.InitialBalance, cfg.DailyBonusInterval), cfg.JWTPrivateKey, cfg.SessionTTL, cfg.RefreshTTL, auth.CookieConfig{
		Name:     cfg.CookieName,
		Domain:   cfg.CookieDomain,
		Secure:   cfg.CookieSecure,
		SameSite: cfg.CookieSameSite,
	}, auth.NewRefreshStore(pool))
	usersHandler := users.NewHandler(users.NewService(pool))
	communitiesHandler := communities.NewHandler(communities.NewService(pool))

	api := app.Group("/api/v1")
	api.Get("/health", requireAuth, healthHandler(pool.Ping))
	authLimit := middleware.AuthLimit()

	api.Post("/auth/register", authLimit, authHandler.Register)
	api.Post("/auth/login", authLimit, authHandler.Login)
	api.Post("/auth/refresh", authHandler.Refresh)
	api.Post("/auth/logout", requireAuth, authHandler.Logout)

	marketAPI := &markets.API{Pool: pool, PayoutGrace: cfg.PayoutGrace}
	// Reads that show balances, markets or stats first apply any overdue
	// payout, so results are current at payoutAt even if the job is late.
	paid := marketAPI.PayDueOnRead
	api.Get("/me", requireAuth, paid, usersHandler.GetMe)
	api.Get("/markets", requireAuth, paid, marketAPI.List)
	api.Get("/markets/:id", requireAuth, paid, marketAPI.Get)
	api.Get("/markets/:id/activity", requireAuth, paid, marketAPI.Activity)
	api.Post("/markets/:id/positions", requireAuth, marketAPI.Bet)
	api.Post("/markets/:id/resolve", requireAuth, marketAPI.Resolve)
	api.Post("/markets/:id/cancel", requireAuth, marketAPI.Cancel)
	api.Get("/me/positions", requireAuth, paid, marketAPI.Positions)
	api.Get("/me/transactions", requireAuth, paid, marketAPI.Transactions)
	api.Get("/me/mod-queue", requireAuth, paid, marketAPI.ModQueue)
	walletAPI := &points.API{Pool: pool, DailyBonusPoints: cfg.DailyBonusPoints, DailyBonusInterval: cfg.DailyBonusInterval}
	api.Get("/me/wallet", requireAuth, paid, walletAPI.Get)
	api.Post("/me/daily-bonus", requireAuth, walletAPI.DailyBonus)
	api.Patch("/me", requireAuth, usersHandler.UpdateMe)
	api.Get("/users/:id", requireAuth, paid, usersHandler.GetProfile)
	api.Get("/invites/:code", requireAuth, communitiesHandler.InvitePreview)
	// The one signed-out read: link previews and the signed-out invite page.
	api.Get("/public/invites/:code", middleware.PublicInviteLimit(), communitiesHandler.PublicInvite)

	c := api.Group("/communities", requireAuth)
	c.Get("/", communitiesHandler.List)
	c.Post("/", communitiesHandler.Create)
	c.Post("/join", communitiesHandler.Join)
	c.Get("/discover", communitiesHandler.Discover)
	c.Post("/:id/join", communitiesHandler.JoinPublic)
	c.Get("/:id", communitiesHandler.Get)
	c.Get("/:id/markets", paid, marketAPI.List)
	c.Post("/:id/markets", marketAPI.Create)
	c.Get("/:id/leaderboard", paid, marketAPI.Leaderboard)
	c.Patch("/:id", communitiesHandler.Update)
	c.Post("/:id/invite-code", communitiesHandler.RegenerateInviteCode)
	c.Get("/:id/members", communitiesHandler.ListMembers)
	c.Patch("/:id/members/:userId", communitiesHandler.UpdateMemberRole)
	c.Delete("/:id/members/:userId", communitiesHandler.RemoveMember)

	return app
}

func healthHandler(ping func(context.Context) error) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), 2*time.Second)
		defer cancel()
		if err := ping(ctx); err != nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": fiber.Map{
				"code": "DATABASE_UNAVAILABLE", "message": "Database unavailable", "fields": fiber.Map{},
			}})
		}
		return c.JSON(fiber.Map{"status": "ok", "database": "connected"})
	}
}
