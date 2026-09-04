# Ambiente locale allineato alla produzione, e al browser che la verifica.
#
# PERCHÉ ESISTE. Il 04-09-2026 una regressione sul form contatti è arrivata in
# produzione (PR #272, riparata dal #273) perché il locale non poteva prenderla:
# la sitekey Turnstile di produzione è legata all'hostname vero, quindi su
# localhost il widget non si rendeva MAI e un guasto reale aveva lo stesso
# sintomo di «siamo in locale». Un ambiente che non sa distinguere un difetto da
# una propria limitazione produce solo conferme.
#
# COSA ALLINEA DAVVERO, detto senza vendere fumo:
#  - il runtime del Worker è GIÀ quello di produzione anche fuori da Docker,
#    perché `wrangler dev` esegue workerd, lo stesso motore di Cloudflare. Docker
#    non aggiunge fedeltà lì, e chi legge non deve credere il contrario.
#  - allinea la VERSIONE DI NODE a quella della CI e del deploy (22, vedi
#    .github/workflows/deploy.yml), che sul portatile è solo quella che capita;
#  - fissa il BROWSER della verifica. È il pezzo che mancava: le prove nel
#    browser giravano su un Chromium installato a mano, diverso a ogni macchina;
#  - rende la verifica ripetibile da chiunque, con un comando, senza preparare
#    niente.
FROM node:22-bookworm-slim

WORKDIR /repo

# Playwright serve in DUE forme, e la prima volta ne avevo installata una sola:
# il browser (binario) e il pacchetto (importabile). `scripts/verifica-browser.mjs`
# fa `import ... from 'playwright'`, e Node lo cerca risalendo da /repo/scripts:
# quindi il pacchetto deve stare in /repo/node_modules, non nella cache di npx e
# nemmeno in un'installazione globale, che la risoluzione ESM ignora.
# Il package.json qui è dell'immagine, non del repo: esiste solo per ancorare
# quel node_modules, e `COPY . .` non lo tocca perché il repo non ne ha uno a
# livello radice.
# `--with-deps` porta anche le librerie di sistema che la slim non ha, così la
# lista non va mantenuta a mano a ogni versione.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npm init -y > /dev/null \
    && npm install --no-save playwright@1.62.1 \
    && npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# Le dipendenze si installano PRIMA del codice: cambiano di rado, e così il
# livello resta in cache mentre il codice cambia a ogni riga.
COPY astro-project/package.json astro-project/package-lock.json ./astro-project/
RUN cd astro-project && npm ci

COPY . .

# 8788 è la porta di `wrangler dev`, la stessa usata dalle verifiche.
EXPOSE 8788
# `SENTRY_ENVIRONMENT` dichiara che questo NON è produzione, così gli errori del
# container non arrivano a Sentry travestiti da traffico vero. Il nome è quello
# che @sentry/cloudflare legge da sé: nessuna riga di codice nel Worker.
# È un flag e non un `.dev.vars` perché il repo è bind-montato, quindi scrivere
# quel file da qui vuol dire scriverlo sul disco dell'host — e se lì ce n'è già
# uno con i segreti veri, lo si sporca o lo si cancella.
CMD ["sh", "-c", "cd astro-project && npm run build && npx wrangler dev --var SENTRY_ENVIRONMENT:development --ip 0.0.0.0 --port 8788"]
