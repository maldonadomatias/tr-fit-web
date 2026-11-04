import { describe, expect, it } from '@jest/globals';
import type { MailBrand } from './config.js';
import {
  emailVerification,
  escapeHtml,
  passwordReset,
  renderMail,
} from './templates.js';

const brand: MailBrand = { name: 'App', color: '#0A7CFF' };
const brandWithLogo: MailBrand = {
  ...brand,
  logoUrl: 'https://app.test/logo.png',
};

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;'
    );
  });
});

describe('renderMail', () => {
  const content = {
    subject: 'Tu turno',
    heading: 'Turno confirmado',
    paragraphs: ['Te esperamos el lunes.', 'Llegá 10 minutos antes.'],
    button: { label: 'Ver turno', url: 'https://app.test/turnos/1' },
  };

  it('shows the logo with the brand name as alt text when a logo is set', () => {
    const { html } = renderMail(brandWithLogo, content);

    expect(html).toContain('src="https://app.test/logo.png"');
    expect(html).toContain('alt="App"');
  });

  it('shows the brand name as text when there is no logo', () => {
    const { html } = renderMail(brand, content);

    expect(html).not.toContain('<img');
    expect(html).toContain('>App<');
  });

  it('keeps the subject and renders heading, paragraphs and button', () => {
    const rendered = renderMail(brand, content);

    expect(rendered.subject).toBe('Tu turno');
    expect(rendered.html).toContain('Turno confirmado');
    expect(rendered.html).toContain('Te esperamos el lunes.');
    expect(rendered.html).toContain('Llegá 10 minutos antes.');
    expect(rendered.html).toContain('href="https://app.test/turnos/1"');
    expect(rendered.html).toContain('Ver turno');
  });

  it('paints the card stripe and the button with the brand color', () => {
    const { html } = renderMail(brand, content);

    expect(html).toContain('border-top:4px solid #0A7CFF');
    expect(html).toContain('bgcolor="#0A7CFF"');
  });

  it('repeats the button link as text for clients that block buttons', () => {
    const { html } = renderMail(brand, content);

    expect(html).toContain('copiá y pegá este enlace');
    expect(html).toContain('>https://app.test/turnos/1</a>');
  });

  it('omits the heading, button and footnote blocks when not given', () => {
    const { html } = renderMail(brand, {
      subject: 's',
      paragraphs: ['Hola'],
    });

    expect(html).not.toContain('<h1');
    expect(html).not.toContain('copiá y pegá');
    expect(html).not.toContain('border-top:1px solid');
  });

  it('escapes brand name, heading, paragraphs, button label and footnote', () => {
    const evil = '<script>alert(1)</script>';
    const { html } = renderMail(
      { ...brandWithLogo, name: evil },
      {
        subject: 's',
        heading: evil,
        paragraphs: [evil],
        button: { label: evil, url: 'https://app.test' },
        footnote: evil,
      }
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes a hidden preheader when given', () => {
    const { html } = renderMail(brand, {
      ...content,
      preheader: 'Lunes 10:00',
    });

    expect(html).toMatch(/display:none[^>]*>Lunes 10:00</);
  });

  it('builds a plain-text version without markup', () => {
    const { text } = renderMail(brand, { ...content, footnote: 'Gracias.' });

    expect(text).toContain('Turno confirmado');
    expect(text).toContain('Te esperamos el lunes.');
    expect(text).toContain('Ver turno: https://app.test/turnos/1');
    expect(text).toContain('Gracias.');
    expect(text).toContain('App');
    expect(text).not.toContain('<');
  });

  it('rejects a non-http button url', () => {
    expect(() =>
      renderMail(brand, {
        ...content,
        button: { label: 'x', url: 'javascript:alert(1)' },
      })
    ).toThrow();
  });
});

describe('passwordReset', () => {
  it('escapes the name in html', () => {
    const rendered = passwordReset(brand, {
      name: '<script>alert(1)</script>',
      resetUrl: 'https://app.test/reset?token=abc',
      expiresInMinutes: 30,
    });

    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).not.toContain('<script>');
  });

  it('includes a plain-text version with the link and expiry', () => {
    const resetUrl = 'https://app.test/reset?token=abc';
    const rendered = passwordReset(brand, {
      resetUrl,
      expiresInMinutes: 30,
    });

    expect(rendered.text).toContain(resetUrl);
    expect(rendered.text).toContain('30 minutos');
    expect(rendered.text).not.toContain('<');
  });

  it('escapes quotes in the url inside href', () => {
    const rendered = passwordReset(brand, {
      resetUrl: 'https://app.test/r?t=a"b',
      expiresInMinutes: 15,
    });

    expect(rendered.html).toContain('a&quot;b');
    expect(rendered.html).not.toContain('a"b');
  });

  it('rejects non-http urls', () => {
    expect(() =>
      passwordReset(brand, {
        resetUrl: 'javascript:alert(1)',
        expiresInMinutes: 30,
      })
    ).toThrow();
  });
});

describe('emailVerification', () => {
  it('returns subject, escaped html and text', () => {
    const verifyUrl = 'https://app.test/verify?token=abc';
    const rendered = emailVerification(brand, {
      name: '<script>alert(1)</script>',
      verifyUrl,
    });

    expect(rendered.subject).toBe('Verificá tu cuenta');
    expect(rendered.html).toContain('&lt;script&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.text).toContain(verifyUrl);
  });

  it('rejects non-http urls', () => {
    expect(() =>
      emailVerification(brand, {
        verifyUrl: 'javascript:alert(1)',
      })
    ).toThrow();
  });
});
