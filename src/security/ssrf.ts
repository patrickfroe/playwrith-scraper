import dns from "node:dns/promises";
import net from "node:net";

const blockedHosts = new Set(["localhost"]);

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 127
  );
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const ipVersion = net.isIP(ip);
  if (ipVersion === 4) return isBlockedIPv4(ip);
  if (ipVersion === 6) return isBlockedIPv6(ip);
  return true;
}

export async function validatePublicHttpUrl(input: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are allowed.");
  }

  const host = parsed.hostname.toLowerCase();

  if (blockedHosts.has(host)) {
    throw new Error("Host is blocked.");
  }

  if (net.isIP(host) && isBlockedIp(host)) {
    throw new Error("IP address is blocked.");
  }

  try {
    const records = await dns.lookup(host, { all: true });
    if (records.length === 0) {
      throw new Error("DNS lookup failed.");
    }
    if (records.some((r) => isBlockedIp(r.address))) {
      throw new Error("Resolved IP is blocked.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("blocked")) {
      throw error;
    }
    throw new Error("Could not resolve host.");
  }

  return parsed;
}
