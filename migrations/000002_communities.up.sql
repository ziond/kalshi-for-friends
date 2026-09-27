BEGIN;

CREATE TABLE communities (
    id BIGSERIAL PRIMARY KEY CHECK (id BETWEEN 1 AND 9007199254740991),
    name VARCHAR(100) NOT NULL CHECK (btrim(name) <> ''),
    description TEXT,
    invite_code VARCHAR(64) NOT NULL UNIQUE CHECK (btrim(invite_code) <> ''),
    creator_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX communities_creator_idx ON communities (creator_id);

CREATE TABLE community_members (
    community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE RESTRICT,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER'
        CHECK (role IN ('MEMBER', 'MODERATOR', 'ADMIN')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, user_id)
);

CREATE INDEX community_members_user_idx ON community_members (user_id, community_id);

COMMENT ON TABLE community_members IS
    'Current membership only. Leaving a community must not delete historical positions or payouts.';

COMMIT;
