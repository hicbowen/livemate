package metrics

import (
	"fmt"
	"math"
	"time"

	"github.com/hicbowen/livemate/internal/domain"
)

// Ratio deliberately returns nil for unknown or zero denominators. A nil
// metric means "not enough data", while a zero source value is preserved.
func Ratio(numerator, denominator float64) *float64 {
	if denominator == 0 || math.IsNaN(numerator) || math.IsNaN(denominator) {
		return nil
	}
	value := numerator / denominator
	if math.IsInf(value, 0) || math.IsNaN(value) {
		return nil
	}
	return &value
}

func SessionMetrics(durationMinutes *int, revenueCents, followersGained, views, payerCount, commentUsers, pkCount, pkWinCount *int64) domain.SessionMetrics {
	var result domain.SessionMetrics
	if durationMinutes != nil && *durationMinutes > 0 {
		hours := float64(*durationMinutes) / 60
		if revenueCents != nil {
			result.RevenuePerHour = Ratio(float64(*revenueCents)/100, hours)
		}
		if followersGained != nil {
			result.FollowersPerHour = Ratio(float64(*followersGained), hours)
		}
	}
	if followersGained != nil && views != nil {
		value := Ratio(float64(*followersGained), float64(*views))
		if value != nil {
			v := *value * 1000
			result.FollowersPer1000Views = &v
		}
	}
	if payerCount != nil && views != nil {
		result.PayerRate = Ratio(float64(*payerCount), float64(*views))
	}
	if commentUsers != nil && views != nil {
		result.CommentUserRate = Ratio(float64(*commentUsers), float64(*views))
	}
	if pkWinCount != nil && pkCount != nil {
		result.PKWinRate = Ratio(float64(*pkWinCount), float64(*pkCount))
	}
	return result
}

func ResolveDuration(startedAt, endedAt *string, manual *int, override bool) (*int, error) {
	if override && manual != nil {
		if *manual < 0 {
			return nil, fmt.Errorf("直播时长不能为负数")
		}
		return manual, nil
	}
	if startedAt != nil && endedAt != nil && *startedAt != "" && *endedAt != "" {
		start, err := parseTime(*startedAt)
		if err != nil {
			return nil, fmt.Errorf("开播时间格式无效：%w", err)
		}
		end, err := parseTime(*endedAt)
		if err != nil {
			return nil, fmt.Errorf("下播时间格式无效：%w", err)
		}
		minutes := int(math.Round(end.Sub(start).Minutes()))
		if minutes < 0 {
			return nil, fmt.Errorf("下播时间不能早于开播时间")
		}
		return &minutes, nil
	}
	if manual != nil {
		if *manual < 0 {
			return nil, fmt.Errorf("直播时长不能为负数")
		}
		return manual, nil
	}
	return nil, nil
}

func ResolveFollowers(before, after, manual *int64) *int64 {
	if before != nil && after != nil {
		value := *after - *before
		return &value
	}
	return manual
}

func parseTime(value string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04", "2006-01-02 15:04:05", "2006-01-02 15:04"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, nil
		}
	}
	return time.Time{}, fmt.Errorf("需要 RFC3339 或常见日期时间格式")
}
