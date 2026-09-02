// Proxy ANaTT — JavaScript classique, autonome, aucune dépendance.
// Role : contourner le CORS du navigateur et relayer HTML + PDF (binaire).
// Corrige la Methode A du rapport : lecture arrayBuffer + relais du Content-Type.
//
// A placer dans un dossier "api/". Compatible avec les hebergeurs de fonctions
// JavaScript qui appellent un handler (req, res). Ne contient ni Node specifique
// ni TypeScript.

// Domaines officiels autorises (protection anti-SSRF : on ne proxifie que ANaTT).
var ALLOWED_HOSTS = ["www.moto.anatt.bj", "moto.anatt.bj"];

// Valide l'URL cible : HTTPS + domaine officiel ANaTT uniquement.
function validerCible(raw) {
  if (!raw || typeof raw !== "string") {
    return { ok: false, status: 400, error: "Parametre « url » manquant." };
  }
  var url;
  try {
    url = new URL(raw);
  } catch (e) {
    return { ok: false, status: 400, error: "URL invalide." };
  }
  if (url.protocol !== "https:" || ALLOWED_HOSTS.indexOf(url.hostname) === -1) {
    return { ok: false, status: 403, error: "Domaine non autorise." };
  }
  return { ok: true, url: url };
}

// Recupere une ressource ANaTT (HTML ou PDF) et renvoie le binaire brut.
async function recupererAnatt(raw) {
  var check = validerCible(raw);
  if (!check.ok) return check;

  try {
    var upstream = await fetch(check.url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OracleANaTT/1.0; +verification-vehicule)",
        Accept: "text/html,application/xhtml+xml,application/pdf,*/*",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
      redirect: "follow",
    });

    var contentType = upstream.headers.get("content-type") || "application/octet-stream";
    var arrayBuffer = await upstream.arrayBuffer();

    return {
      ok: true,
      status: upstream.status,
      contentType: contentType,
      buffer: Buffer.from(arrayBuffer),
    };
  } catch (err) {
    var message = err && err.message ? err.message : String(err);
    return { ok: false, status: 502, error: "Echec de recuperation depuis ANaTT : " + message };
  }
}

// Handler de la fonction : req.query.url = URL ANaTT encodee cote client.
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Methode non autorisee." }));
    return;
  }

  // Recupere le parametre "url" (selon l'hebergeur, req.query peut ne pas exister).
  var rawUrl = null;
  if (req.query && req.query.url) {
    rawUrl = req.query.url;
  } else if (req.url) {
    try {
      rawUrl = new URL(req.url, "http://localhost").searchParams.get("url");
    } catch (e) {
      rawUrl = null;
    }
  }

  var result = await recupererAnatt(rawUrl);

  if (!result.ok) {
    res.statusCode = result.status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: result.error }));
    return;
  }

  res.statusCode = result.status;
  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Cache-Control", "no-store");
  res.end(result.buffer);
};
