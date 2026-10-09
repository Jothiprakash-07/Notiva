import nodemailer from "nodemailer";

// Replace mailer.send in tests; never log transport errors or message contents.
export const mailer = {
  async send({ to, subject, text }) {
    const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) throw new Error("Mail service unavailable");
    const transport = nodemailer.createTransport({
      host: SMTP_HOST, port: Number(SMTP_PORT || 465), secure: SMTP_SECURE === "true",
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      logger: false, debug: false,
    });
    await transport.sendMail({ from: SMTP_USER, to, subject, text });
  },
};
