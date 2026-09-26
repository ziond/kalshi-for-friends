// Package communities owns communities, membership, roles, and invite codes.
package communities

import (
	"time"

	"github.com/ziond/kalshi-for-friends/backend/internal/modules/users"
)

type Role string

const (
	RoleMember    Role = "MEMBER"
	RoleModerator Role = "MODERATOR"
	RoleAdmin     Role = "ADMIN"
)

func (r Role) Valid() bool {
	return r == RoleMember || r == RoleModerator || r == RoleAdmin
}

func (r Role) CanSeeInviteCode() bool {
	return r == RoleModerator || r == RoleAdmin
}

type CommunitySummary struct {
	ID              int64     `json:"id"`
	Name            string    `json:"name"`
	Description     *string   `json:"description"`
	MemberCount     int64     `json:"memberCount"`
	OpenMarketCount int64     `json:"openMarketCount"`
	MyRole          Role      `json:"myRole"`
	CreatedAt       time.Time `json:"createdAt"`
}

type CommunityDetail struct {
	CommunitySummary
	Creator    users.UserSummary `json:"creator"`
	InviteCode *string           `json:"inviteCode"`
}

type CommunityMember struct {
	User     users.UserSummary `json:"user"`
	Role     Role              `json:"role"`
	JoinedAt time.Time         `json:"joinedAt"`
}

type CreateCommunityRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
}

type UpdateCommunityRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type JoinCommunityRequest struct {
	InviteCode string `json:"inviteCode"`
}

type UpdateMemberRoleRequest struct {
	Role Role `json:"role"`
}

type InviteCodeResponse struct {
	InviteCode string `json:"inviteCode"`
}
