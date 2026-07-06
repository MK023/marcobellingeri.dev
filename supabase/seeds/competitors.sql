-- Seed Canale 2 — roster competitor curato (scelta di Marco, bilanciato
-- 60% tech-radar / 40% editorial-radar). Idempotente: on conflict (url) do nothing.
-- Rende riproducibile il radar dopo un rebuild del DB.

insert into competitor_sources (name, url, kind, category) values
  ('Azeem Azhar — Exponential View',          'https://www.exponentialview.co/',            'newsletter', 'editorial-radar'),
  ('Ben Thompson — Stratechery',              'https://stratechery.com/',                   'newsletter', 'editorial-radar'),
  ('Benedict Evans',                          'https://www.ben-evans.com/newsletter',       'newsletter', 'editorial-radar'),
  ('Ethan Mollick — One Useful Thing',        'https://www.oneusefulthing.org/',            'newsletter', 'editorial-radar'),
  ('Corey Quinn — Last Week in AWS',          'https://www.lastweekinaws.com/blog/',        'blog',       'tech-radar'),
  ('ENISA — News',                            'https://www.enisa.europa.eu/news',           'outlet',     'tech-radar'),
  ('Gergely Orosz — The Pragmatic Engineer',  'https://newsletter.pragmaticengineer.com/',  'newsletter', 'tech-radar'),
  ('Julia Evans (jvns)',                      'https://jvns.ca/',                           'blog',       'tech-radar'),
  ('Simon Willison',                          'https://simonwillison.net/',                 'blog',       'tech-radar'),
  ('Troy Hunt',                               'https://www.troyhunt.com/',                  'blog',       'tech-radar')
on conflict (url) do nothing;
