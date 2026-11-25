import { generateVAPIDKeys, sendNotification, setVapidDetails } from 'web-push';
import type { AlertRecord } from '../../shared/types.ts';
import type { GoldMonitorDatabase } from '../db.ts';

interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export class PushNotificationService {
  private readonly db: GoldMonitorDatabase;
  private readonly keys: VapidKeys;

  constructor(db: GoldMonitorDatabase) {
    this.db = db;
    this.keys = this.loadOrGenerateKeys();
    setVapidDetails(this.keys.subject, this.keys.publicKey, this.keys.privateKey);
  }

  private loadOrGenerateKeys(): VapidKeys {
    const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
    const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:alerts@goldbubble.local';

    if (envPublic && envPrivate) {
      return { publicKey: envPublic, privateKey: envPrivate, subject };
    }

    const storedPub = this.db.getInternalSecret('__vapid_public_key');
    const storedPriv = this.db.getInternalSecret('__vapid_private_key');
    if (storedPub && storedPriv) {
      return { publicKey: storedPub, privateKey: storedPriv, subject };
    }

    const generated = generateVAPIDKeys();
    this.db.setInternalSecret('__vapid_public_key', generated.publicKey);
    this.db.setInternalSecret('__vapid_private_key', generated.privateKey);
    return { publicKey: generated.publicKey, privateKey: generated.privateKey, subject };
  }

  getPublicKey(): string {
    return this.keys.publicKey;
  }

  async sendAlertNotifications(alerts: AlertRecord[]): Promise<void> {
    if (alerts.length === 0) return;
    const settings = this.db.getSettings();
    if (!settings.notificationsEnabled) return;

    const subscriptions = this.db.getPushSubscriptions();
    if (subscriptions.length === 0) return;

    for (const alert of alerts) {
      const bubbleStr =
        alert.bubbleToman !== null
          ? `${alert.bubbleToman > 0 ? '+' : ''}${new Intl.NumberFormat('fa-IR').format(alert.bubbleToman)} تومان`
          : 'نامشخص';
      const pctStr =
        alert.bubblePercent !== null
          ? `(${alert.bubblePercent > 0 ? '+' : ''}${alert.bubblePercent.toFixed(2)}٪)`
          : '';

      const payload = JSON.stringify({
        title: alert.title,
        body: `${alert.reason} | حباب فعلی: ${bubbleStr} ${pctStr}`,
        tag: `gold-alert-${alert.ruleType}`,
        url: '/',
      });

      await Promise.all(
        subscriptions.map(async (sub) => {
          try {
            await sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              payload
            );
          } catch (err) {
            const statusCode =
              typeof err === 'object' && err !== null && 'statusCode' in err
                ? Number((err as { statusCode: unknown }).statusCode)
                : 0;
            if (statusCode === 404 || statusCode === 410) {
              this.db.removePushSubscription(sub.endpoint);
            }
          }
        })
      );
    }
  }

  async sendTestNotification(): Promise<{ sent: number; failed: number }> {
    const subscriptions = this.db.getPushSubscriptions();
    let sent = 0;
    let failed = 0;

    const payload = JSON.stringify({
      title: 'تست اعلان پایشگر حباب طلا',
      body: 'اتصال سیستم هشدار پس‌زمینه با موفقیت برقرار است.',
      tag: 'gold-alert-test',
      url: '/',
    });

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
        } catch (err) {
          failed++;
          const statusCode =
            typeof err === 'object' && err !== null && 'statusCode' in err
              ? Number((err as { statusCode: unknown }).statusCode)
              : 0;
          if (statusCode === 404 || statusCode === 410) {
            this.db.removePushSubscription(sub.endpoint);
          }
        }
      })
    );

    return { sent, failed };
  }
}
