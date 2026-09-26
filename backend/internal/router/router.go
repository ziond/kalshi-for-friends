// Package router assembles the Fiber app and registers the API routes.
package router

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/ziond/kalshi-for-friends/backend/internal/config"
	"github.com/ziond/kalshi-for-friends/backend/internal/middleware"
	"github.com/ziond/kalshi-for-friends/backend/internal/modules/auth"
	"github.com/ziond/kalshi-for-friends/backend/internal/modules/communities"
	"github.com/ziond/kalshi-for-friends/backend/internal/modules/users"
)

func New(cfg *config.Config, pool *pgxpool.Pool) *fiber.App {
	app := fiber.New(fiber.Config{
		AppName:      "oracle-api",
		ErrorHandler: middleware.ErrorHandler,
	})
	app.Use(recover.New())
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

	requireAuth := middleware.RequireAuth(cfg.CookieName, auth.NewVerifier(cfg))

	authHandler := auth.NewHandler(auth.NewService(pool, cfg.InitialBalance), cfg.JWTPrivateKey, cfg.SessionTTL, auth.CookieConfig{
		Name:     cfg.CookieName,
		Domain:   cfg.CookieDomain,
		Secure:   cfg.CookieSecure,
		SameSite: cfg.CookieSameSite,
	})
	usersHandler := users.NewHandler(users.NewService(pool))
	communitiesHandler := communities.NewHandler(communities.NewService(pool))

	api := app.Group("/api/v1")
	api.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	api.Post("/auth/register", authHandler.Register)
	api.Post("/auth/login", authHandler.Login)
	api.Post("/auth/logout", authHandler.Logout)

	api.Get("/me", requireAuth, usersHandler.GetMe)
	api.Patch("/me", requireAuth, usersHandler.UpdateMe)
	api.Get("/users/:id", requireAuth, usersHandler.GetProfile)

	c := api.Group("/communities", requireAuth)
	c.Get("/", communitiesHandler.List)
	c.Post("/", communitiesHandler.Create)
	c.Post("/join", communitiesHandler.Join)
	c.Get("/:id", communitiesHandler.Get)
	c.Patch("/:id", communitiesHandler.Update)
	c.Post("/:id/invite-code", communitiesHandler.RegenerateInviteCode)
	c.Get("/:id/members", communitiesHandler.ListMembers)
	c.Patch("/:id/members/:userId", communitiesHandler.UpdateMemberRole)
	c.Delete("/:id/members/:userId", communitiesHandler.RemoveMember)

	return app
}
