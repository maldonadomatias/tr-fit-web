-- MercadoPago integration removed: the /webhooks/mp handler was the only
-- reader/writer of mp_webhook_log. The subscriptions table stays — the admin
-- dashboard still reads/writes it for manually managed subscriptions.
DROP TABLE IF EXISTS mp_webhook_log;
