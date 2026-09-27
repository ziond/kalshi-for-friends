package points

import (
	"testing"
	"time"
)

func TestWAL12NotReadyWording(t *testing.T) {
	for d, want := range map[time.Duration]string{
		5*time.Hour + 12*time.Minute:         "5h 12m",
		5*time.Hour + 11*time.Minute + 1:     "5h 12m",
		23*time.Hour + 59*time.Minute + 59e9: "24h 0m",
		45 * time.Minute:                     "45m",
		30 * time.Second:                     "1m",
		0:                                    "1m",
	} {
		if got := waitText(d); got != want {
			t.Errorf("waitText(%v) = %q, want %q", d, got, want)
		}
	}
	for n, want := range map[int64]string{1: "1", 999: "999", 1000: "1,000", 1000000: "1,000,000"} {
		if got := groupThousands(n); got != want {
			t.Errorf("groupThousands(%d) = %q, want %q", n, got, want)
		}
	}
}
