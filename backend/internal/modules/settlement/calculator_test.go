package settlement

import "testing"

func TestRES06Conservation(t *testing.T) {
	stakes := []Stake{{ID: 1, UserID: 1, OptionID: 1, Amount: 2}, {ID: 2, UserID: 2, OptionID: 1, Amount: 2}, {ID: 3, UserID: 3, OptionID: 2, Amount: 1}}
	payouts, refund, err := Payouts(stakes, 1, false)
	if err != nil || refund || payouts[1] != 3 || payouts[2] != 2 || payouts[3] != 0 {
		t.Fatalf("bad payouts: %v %v", payouts, err)
	}
	for _, cancel := range []bool{false, true} {
		p, ref, err := Payouts(stakes, 99, cancel)
		if err != nil || !ref {
			t.Fatal("expected refund")
		}
		for _, s := range stakes {
			if p[s.ID] != s.Amount {
				t.Fatal("points lost")
			}
		}
	}
}

func TestDATA05LargeIntegerPool(t *testing.T) {
	s := []Stake{{ID: 1, OptionID: 1, Amount: 4000000000000000}, {ID: 2, OptionID: 2, Amount: 4000000000000000}}
	p, _, err := Payouts(s, 1, false)
	if err != nil || p[1] != 8000000000000000 {
		t.Fatalf("overflow: %v %v", p, err)
	}
}
