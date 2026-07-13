export type PrivateNetworkClass = "loopback" | "private" | null;

function classifyIpv4(host: string): PrivateNetworkClass {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return "private";
  const [a, b] = octets;
  if (a === 0 || a === 127) return "loopback";
  if (
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  ) {
    return "private";
  }
  return null;
}

function embeddedIpv4FromIpv6(host: string): string | null {
  // WHATWG URL parsing canonicalizes dotted IPv4-mapped literals such as
  // ::ffff:127.0.0.1 into the two-hextet form below.
  const match = host.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!match) return null;
  const high = Number.parseInt(match[1], 16);
  const low = Number.parseInt(match[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/** Classifies literal and reserved local hostnames after URL normalization. */
export function classifyPrivateNetworkHostname(
  hostname: string,
): PrivateNetworkClass {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

  if (host === "localhost" || host.endsWith(".localhost")) return "loopback";
  if (/\.(?:local|internal|home|lan)$/.test(host)) return "private";

  const ipv4Class = classifyIpv4(host);
  if (ipv4Class) return ipv4Class;

  if (!host.includes(":")) return null;
  if (host === "::1") return "loopback";
  if (host === "::") return "private";

  const embeddedIpv4 = embeddedIpv4FromIpv6(host);
  if (embeddedIpv4) return classifyIpv4(embeddedIpv4);

  if (
    /^f[cd]/i.test(host) ||
    /^fe[89a-f]/i.test(host) ||
    /^ff/i.test(host)
  ) {
    return "private";
  }
  return null;
}
