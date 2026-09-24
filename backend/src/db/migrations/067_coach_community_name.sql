-- Community posts by the dashboard admin showed as "Usuario": that account
-- was created without a signup name or a coach profile, and the feed falls
-- back to that label. Athletes should see the coach's public name.
INSERT INTO coach_profiles (user_id, name)
SELECT u.id, 'Tato Robles Fit'
  FROM users u
 WHERE u.role = 'admin'
   AND NOT EXISTS (
     SELECT 1 FROM coach_profiles cp WHERE cp.user_id = u.id
   );
