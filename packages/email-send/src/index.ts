import nodemailer, { type Transporter } from "nodemailer";

/** Minimal email shape used by the web app demos. */
export type EmailMessage = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

/** Contract implemented by transports used with {@link createEmailSender}. */
export type EmailSender = {
  send: (message: EmailMessage) => Promise<void>;
};

/** Builds a Resend-compatible HTTP transport stub via nodemailer HTTP (not used in dev). */
export const createResendTransport = (opts: {
  apiKey: string;
}): Transporter => {
  void opts.apiKey;
  return nodemailer.createTransport({
    host: "localhost",
    port: 2500,
    secure: false,
  });
};

/** Local SMTP transport for development (e.g. Mailpit). */
export const createSmtpTransport = (opts: {
  host: string;
  port: number;
}): Transporter => {
  return nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: false,
  });
};

/**
 * Creates a tiny sender that delegates to a nodemailer transport.
 *
 * @param deps - Collaborators with production defaults.
 */
export const createEmailSender = (deps: {
  from: string;
  transport: Transporter;
}): EmailSender => {
  const { from, transport } = deps;
  return {
    send: async (message: EmailMessage): Promise<void> => {
      await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
};
