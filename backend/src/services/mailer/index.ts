import { createMailClient, type MailInput, type MailResult } from './client.js';
import { loadMailBrand, type MailBrand } from './config.js';
import * as templates from './templates.js';
import type { MailContent, RenderedMail } from './templates.js';

// Nothing is read or validated at import: config errors surface on first use.
const client = createMailClient();
let brand: MailBrand | undefined;
const currentBrand = () => (brand ??= loadMailBrand());

export const sendMail = (input: MailInput): Promise<MailResult> =>
  client.sendMail(input);

export const renderMail = (content: MailContent): RenderedMail =>
  templates.renderMail(currentBrand(), content);

export const passwordReset = (
  p: Parameters<typeof templates.passwordReset>[1]
): RenderedMail => templates.passwordReset(currentBrand(), p);

export const emailVerification = (
  p: Parameters<typeof templates.emailVerification>[1]
): RenderedMail => templates.emailVerification(currentBrand(), p);

export { MailerError } from './client.js';
export type { MailContent, MailInput, MailResult, RenderedMail };
