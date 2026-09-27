// Command server assembles and runs the backend API.
package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ziond/kalshi-for-friends/backend/internal/config"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
	"github.com/ziond/kalshi-for-friends/backend/internal/modules/markets"
	"github.com/ziond/kalshi-for-friends/backend/internal/router"
)

func main() {
	if err := run(); err != nil {
		log.Print(err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	pool, err := database.New(ctx, cfg.DatabaseURL)
	cancel()
	if err != nil {
		return err
	}
	defer pool.Close()

	app := router.New(cfg, pool)

	// Pays out markets whose grace period has ended, even if nobody is reading them.
	jobCtx, stopJob := context.WithCancel(context.Background())
	defer stopJob()
	go markets.RunPayoutJob(jobCtx, pool, 5*time.Second)

	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
		<-stop
		if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
			log.Printf("shutdown: %v", err)
		}
	}()

	return app.Listen(net.JoinHostPort(cfg.HTTPHost, cfg.Port))
}
