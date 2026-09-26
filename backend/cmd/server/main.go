// Command server assembles and runs the backend API.
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ziond/kalshi-for-friends/backend/internal/config"
	"github.com/ziond/kalshi-for-friends/backend/internal/database"
	"github.com/ziond/kalshi-for-friends/backend/internal/router"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	pool, err := database.New(ctx, cfg.DatabaseURL)
	cancel()
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	app := router.New(cfg, pool)

	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
		<-stop
		if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
			log.Printf("shutdown: %v", err)
		}
	}()

	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
