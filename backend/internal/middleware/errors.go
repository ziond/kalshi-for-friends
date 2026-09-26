package middleware

import (
	"errors"
	"log"
	"net/http"

	"github.com/gofiber/fiber/v2"

	"github.com/ziond/kalshi-for-friends/backend/internal/apperror"
)

// ErrorHandler renders every error in the shared API error shape. Unknown
// errors are logged and hidden behind a generic 500.
func ErrorHandler(c *fiber.Ctx, err error) error {
	var appErr *apperror.Error
	if !errors.As(err, &appErr) {
		var fiberErr *fiber.Error
		switch {
		case errors.As(err, &fiberErr) && fiberErr.Code == http.StatusNotFound:
			appErr = apperror.NotFound("Route not found")
		case errors.As(err, &fiberErr) && fiberErr.Code == http.StatusMethodNotAllowed:
			appErr = apperror.New(http.StatusMethodNotAllowed, "METHOD_NOT_ALLOWED", "Method not allowed")
		case errors.As(err, &fiberErr) && fiberErr.Code < http.StatusInternalServerError:
			appErr = apperror.New(fiberErr.Code, "BAD_REQUEST", fiberErr.Message)
		default:
			log.Printf("unhandled error on %s %s: %v", c.Method(), c.Path(), err)
			appErr = apperror.New(http.StatusInternalServerError, "INTERNAL_ERROR", "Something went wrong")
		}
	}
	return c.Status(appErr.Status).JSON(fiber.Map{"error": appErr})
}
