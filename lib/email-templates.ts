/**
 * Pre-built email templates for the internal email system.
 *
 * Each template provides a function that wraps user content in a
 * branded layout. All templates are responsive and dark-mode friendly.
 */

export type EmailCategory =
  | 'newsletter'
  | 'product_update'
  | 'announcement'
  | 'security_advisory'
  | 'onboarding'
  | 'transactional';

export interface EmailTemplateOptions {
  subject: string;
  body: string;
  preheader?: string;
  ctaText?: string;
  ctaUrl?: string;
  footerText?: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const SOCIAL_ICONS_URL = 'https://cencori.com/social';

function socialFooter(): string {
  const icons = [
    { name: 'GitHub', file: 'github-icon.png', url: 'https://github.com/cencori' },
    { name: 'X', file: 'x-icon.png', url: 'https://x.com/cencori' },
    { name: 'LinkedIn', file: 'linkedin-icon.png', url: 'https://linkedin.com/company/cencori' },
    { name: 'Discord', file: 'discord-icon.png', url: 'https://discord.gg/cencori' },
    { name: 'YouTube', file: 'youtube-icon.png', url: 'https://youtube.com/@cencori' },
  ];
  const img = (i: typeof icons[number]) =>
    `<a href="${i.url}" style="color:#888;text-decoration:none;display:inline-block;vertical-align:middle;"><img src="${SOCIAL_ICONS_URL}/${i.file}" width="20" height="20" alt="${i.name}" style="display:inline-block;vertical-align:middle;border:0;"></a>`;
  return `<p style="margin:0 0 8px;font-size:12px;color:#999;text-align:center;">${icons.map((i, idx) => img(i) + (idx < icons.length - 1 ? '<span style="color:#ccc;margin:0 6px;vertical-align:middle;">·</span>' : '')).join('')}</p>
<p style="margin:0 0 4px;font-size:12px;color:#999;text-align:center;">Cencori, Inc. · San Francisco, CA</p>`;
}

function baseFooter(extra?: string): string {
  return `
    <div class="footer" style="text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid #dadce0;">
      ${extra ? `<p class="muted" style="color:#5f6368;font-size:12px;margin:0 0 10px;line-height:1.5;">${extra}</p>` : ''}
      <p class="muted" style="color:#5f6368;font-size:11px;margin:0;">
        © ${CURRENT_YEAR} <a href="https://cencori.com" class="muted" style="color:#5f6368;text-decoration:none;">Cencori</a>
      </p>
    </div>`;
}

function wrapInContainer(content: string, preheader?: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>Cencori</title>
  <!--[if mso]>
  <style>
    table {border-collapse:collapse;border:0;border-spacing:0;margin:0;}
    div, td {padding:0;}
    div {margin:0 !important;}
  </style>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, .body {
      margin: 0 !important;
      padding: 0 !important;
      background-color: #ffffff !important;
      color: #202124 !important;
    }
    table, td { color: #202124; }
    a { color: #1a73e8; text-decoration: underline; }
    img { border: 0; display: block; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    p { margin: 0 0 10px; }
    h1, h2, h3, h4, h5, h6 { margin: 0; padding: 0; }

    /* Gmail-like (Google Material) light tokens */
    .bg { background-color: #ffffff !important; }
    .frame { background-color: #ffffff !important; border: 0 !important; border-radius: 0 !important; }
    .frame-pad { padding: 24px 18px !important; }
    .text { color: #202124 !important; }
    .muted { color: #5f6368 !important; }
    .accent { color: #1a73e8 !important; }
    .divider { border-top: 1px solid #dadce0 !important; }
    .callout { background-color: #f1f3f4 !important; border: 1px solid #dadce0 !important; border-radius: 12px !important; }
    .btn { background: #1a73e8 !important; color: #ffffff !important; text-decoration: none !important; border-radius: 999px !important; display: inline-block !important; font-weight: 700 !important; }
    .btn-outline { background: transparent !important; border: 1px solid #1a73e8 !important; color: #1a73e8 !important; text-decoration: none !important; border-radius: 999px !important; display: inline-block !important; font-weight: 600 !important; }
    .check { color: #188038 !important; font-weight: bold !important; }

    @media (max-width: 600px) {
      .frame-pad { padding: 18px 14px !important; }
    }

    @media (prefers-color-scheme: dark) {
      /* Gmail-like (Google Material) dark tokens */
      body, .body { background-color: #131314 !important; color: #e8eaed !important; }
      table, td { color: #e8eaed !important; }
      .bg { background-color: #131314 !important; }
      .frame { background-color: #131314 !important; border: 0 !important; border-radius: 0 !important; }
      .text { color: #e8eaed !important; }
      .muted { color: #9aa0a6 !important; }
      .accent { color: #8ab4f8 !important; }
      .divider { border-top-color: #3c4043 !important; }
      .callout { background-color: #2b2c2f !important; border-color: #3c4043 !important; }
      a { color: #8ab4f8 !important; }
      .btn { background: #8ab4f8 !important; color: #131314 !important; }
      .btn-outline { border-color: #8ab4f8 !important; color: #8ab4f8 !important; }
      .check { color: #81c995 !important; }

      .footer { border-top-color: #3c4043 !important; }
    }

    /* Outlook.com / Office 365 dark mode hooks */
    [data-ogsc] body, [data-ogsc] .body, [data-ogsc] .bg { background-color: #131314 !important; }
    [data-ogsc] .frame { background-color: #131314 !important; border: 0 !important; border-radius: 0 !important; }
    [data-ogsc] .text { color: #e8eaed !important; }
    [data-ogsc] .muted { color: #9aa0a6 !important; }
    [data-ogsc] .accent, [data-ogsc] a { color: #8ab4f8 !important; }
    [data-ogsc] .divider { border-top-color: #3c4043 !important; }
    [data-ogsc] .callout { background-color: #2b2c2f !important; border-color: #3c4043 !important; }
    [data-ogsc] .btn { background: #8ab4f8 !important; color: #131314 !important; }
    [data-ogsc] .btn-outline { border-color: #8ab4f8 !important; color: #8ab4f8 !important; }
    [data-ogsc] .check { color: #81c995 !important; }
    [data-ogsc] .footer { border-top-color: #3c4043 !important; }
  </style>
</head>
<body class="body" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif,'Apple Color Emoji','Segoe UI Emoji','Segoe UI Symbol';line-height:1.5;color:#202124;background-color:#ffffff;margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" class="bg" style="background-color:#ffffff;background:#ffffff;" bgcolor="#ffffff">
    <tr>
      <td align="center" class="bg" style="background-color:#ffffff;background:#ffffff;padding:0;" bgcolor="#ffffff">
        ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>` : ''}
        <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" class="frame" style="max-width:600px;width:100%;background-color:#ffffff;border:0;border-radius:0;overflow:hidden;" bgcolor="#ffffff">
          <tr>
            <td class="frame-pad" style="padding:24px 18px;text-align:left;">
              ${content}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Minimal template — clean, simple, direct communication.
 * Best for: transactional emails, quick announcements, security advisories.
 */
export function minimalTemplate(options: EmailTemplateOptions): string {
  const { body, preheader, ctaText, ctaUrl, footerText } = options;

  const ctaBlock = ctaText && ctaUrl
    ? `<div style="text-align:center;margin:24px 0 0;">
        <a href="${ctaUrl}" class="btn" style="padding:12px 28px;font-size:14px;letter-spacing:0.2px;">${ctaText}</a>
      </div>`
    : '';

  return wrapInContainer(`
    <div class="text" style="font-size:13px;color:#202124;line-height:1.5;">
      ${body}
    </div>
    ${ctaBlock}
    ${baseFooter(footerText)}
  `, preheader);
}

/**
 * Render an email. All categories share the same minimal template — just
 * logo, body, and a one-line footer. The category param is kept for API
 * compatibility with send/route.ts and for future per-category variance.
 */
/**
 * Product update template — text-heavy with grey social icons in footer.
 * Best for: feature announcements, product news, AI infrastructure updates.
 */
export function productUpdateTemplate(options: EmailTemplateOptions): string {
  const { body, preheader, ctaText, ctaUrl } = options;

  const ctaBlock = ctaText && ctaUrl
    ? `<div style="text-align:center;margin:24px 0 0;">
        <a href="${ctaUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:500;">${ctaText}</a>
      </div>`
    : '';

  return wrapInContainer(`
    <div style="font-size:14px;color:#555;line-height:1.6;">
      ${body}
    </div>
    ${ctaBlock}
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;">
      ${socialFooter()}
      <p style="margin:0;font-size:11px;color:#aaa;text-align:center;"><a href="{{unsubscribe_url}}" style="color:#888;text-decoration:underline;">Unsubscribe</a></p>
    </div>
  `, preheader);
}

export function renderTemplate(
  category: string,
  options: EmailTemplateOptions
): string {
  if (category === 'product_update' || category === 'announcement') {
    return productUpdateTemplate(options);
  }
  return minimalTemplate(options);
}

// ── Launch / announcement template ──────────────────────────────
//
// The canonical "banner + prose + links + CTA + footer" layout used by the
// welcome email. Reuse it for any launch announcement (Vision, Documents,
// Sessions, etc.) so every "big drop" email has the same visual grammar.
//
// @example
//   const html = launchTemplate({
//     bannerUrl: 'https://raw.githubusercontent.com/cencori/cencori/master/public/blog/images/covers/vision.png',
//     bannerAlt: 'Cencori Vision',
//     greeting: 'Hi bola,',
//     paragraphs: [
//       'Vision is live on Cencori.',
//       'Analyze, describe, OCR, and classify images across GPT-4o, Claude, and Gemini through one endpoint.',
//     ],
//     linksHeader: 'To get started:',
//     links: [
//       { label: 'Read the Vision API reference', url: 'https://cencori.com/docs/api/vision' },
//       { label: 'Build a receipt scanner in ten minutes', url: 'https://cencori.com/docs/guides/build-a-receipt-scanner' },
//     ],
//     ctaText: 'Read the launch post',
//     ctaUrl: 'https://cencori.com/blog/vision',
//     signOff: 'Build different.',
//     unsubscribeUrl,
//     preferencesUrl,
//     footerContext: 'You received this because you signed up for Cencori.',
//   });

export interface LaunchTemplateOptions {
  /** Full-width banner image URL. Sits at the top of the message. */
  bannerUrl: string;
  /** Alt text for the banner. */
  bannerAlt?: string;
  /** Optional preheader (inbox preview text). */
  preheader?: string;
  /** Line above the body, e.g. `Hi bola,`. Rendered as its own paragraph. */
  greeting?: string;
  /** One paragraph per array entry, rendered in order. */
  paragraphs: string[];
  /** Optional heading above the links list (e.g. `To get started:`). */
  linksHeader?: string;
  /** Zero or more link rows. Each renders as `Label →`. */
  links?: Array<{ label: string; url: string }>;
  /** Text for the dark CTA button. Omit both to hide the button. */
  ctaText?: string;
  ctaUrl?: string;
  /** One final paragraph after the CTA (e.g. `Build different.`). */
  signOff?: string;
  /** Where "Manage preferences" points. */
  preferencesUrl: string;
  /** Where "Unsubscribe" points. */
  unsubscribeUrl: string;
  /** One-line footer explaining why the recipient got the email. */
  footerContext?: string;
}

const LAUNCH_SOCIAL_ICONS_URL = 'https://cencori.com/social';
const LAUNCH_SOCIAL_ICONS = [
  { name: 'GitHub', file: 'github-icon.png', url: 'https://github.com/cencori' },
  { name: 'X', file: 'x-icon.png', url: 'https://x.com/cencori' },
  { name: 'LinkedIn', file: 'linkedin-icon.png', url: 'https://linkedin.com/company/cencori' },
  { name: 'Discord', file: 'discord-icon.png', url: 'https://discord.gg/cencori' },
  { name: 'YouTube', file: 'youtube-icon.png', url: 'https://youtube.com/@cencori' },
];

function launchIconRow(): string {
  const img = (i: typeof LAUNCH_SOCIAL_ICONS[number]) =>
    `<a href="${i.url}" style="color:#888;text-decoration:none;display:inline-block;vertical-align:middle;"><img src="${LAUNCH_SOCIAL_ICONS_URL}/${i.file}" width="20" height="20" alt="${i.name}" style="display:inline-block;vertical-align:middle;border:0;"></a>`;
  return LAUNCH_SOCIAL_ICONS
    .map((i, idx) => img(i) + (idx < LAUNCH_SOCIAL_ICONS.length - 1 ? '<span style="color:#ccc;margin:0 6px;vertical-align:middle;">·</span>' : ''))
    .join('');
}

function launchLink(text: string, href: string): string {
  return `<a href="${href}" style="color:#111;text-decoration:underline;">${text} &#8594;</a>`;
}

export function launchTemplate(options: LaunchTemplateOptions): string {
  const {
    bannerUrl,
    bannerAlt = 'Cencori',
    preheader,
    greeting,
    paragraphs,
    linksHeader,
    links,
    ctaText,
    ctaUrl,
    signOff,
    preferencesUrl,
    unsubscribeUrl,
    footerContext = 'You received this because you signed up for Cencori.',
  } = options;

  const paragraph = (text: string) =>
    `<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#555;">${text}</p>`;

  const greetingBlock = greeting ? paragraph(greeting) : '';
  const paragraphsBlock = paragraphs.map(paragraph).join('');

  const linksBlock = links && links.length > 0
    ? (linksHeader ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#555;">${linksHeader}</p>` : '') +
      links.map(l => `<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#555;">${launchLink(l.label, l.url)}</p>`).join('') +
      '<p style="margin:0 0 24px;"></p>'
    : '';

  const ctaBlock = ctaText && ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:500;">${ctaText}</a>`
    : '';

  const signOffBlock = signOff
    ? `<p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#555;">${signOff}</p>`
    : '';

  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;color:#111;">
${preheaderBlock}
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<img src="${bannerUrl}" alt="${bannerAlt}" style="display:block;width:100%;height:auto;margin-bottom:32px;">
${greetingBlock}
${paragraphsBlock}
${linksBlock}
${ctaBlock}
${signOffBlock}
<div style="margin-top:32px;padding-top:24px;border-top:1px solid #eee;">
<p style="margin:0 0 12px;font-size:12px;color:#999;text-align:center;"><a href="https://cencori.com/docs" style="color:#888;text-decoration:underline;">Docs</a> &nbsp;&middot;&nbsp; <a href="https://cencori.com/blog" style="color:#888;text-decoration:underline;">Blog</a></p>
<p style="margin:0 0 8px;font-size:12px;color:#999;text-align:center;">${launchIconRow()}</p>
<p style="margin:0 0 12px;font-size:12px;color:#999;text-align:center;line-height:1.5;">Making AI infrastructure accessible &mdash; so builders can build and scale with confidence.</p>
<p style="margin:0 0 12px;font-size:11px;color:#aaa;text-align:center;line-height:1.5;">${footerContext}</p>
<p style="margin:0 0 4px;font-size:11px;color:#aaa;text-align:center;"><a href="${preferencesUrl}" style="color:#888;text-decoration:underline;">Manage preferences</a> &nbsp;&middot;&nbsp; <a href="${unsubscribeUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a></p>
<p style="margin:0;font-size:11px;color:#aaa;text-align:center;">Cencori, Inc. &middot; San Francisco, CA</p>
</div>
</div>
</body>
</html>`;
}
