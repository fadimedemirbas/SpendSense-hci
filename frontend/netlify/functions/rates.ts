// Netlify Function behind GET /api/rates (rewrite in netlify.toml). TCMB exchange
// rates for TRY/USD/EUR; all logic and safeguards live in ../lib/tcmb.ts.
import { createRatesHandler } from "../lib/tcmb.ts";

export default createRatesHandler();
