// A shared selfie belongs to two people. The one who took it always sees it; the
// other only sees it as a request (to accept or remove) until they accept.
export function selfieView(cn, meId) {
  if (!cn.selfie_key) return { selfie: null, selfieStatus: null, selfieRequest: null };
  const url = `/media/${cn.selfie_key}`;
  const accepted = !!cn.consent_b;
  if (accepted) return { selfie: url, selfieStatus: "accepted", selfieRequest: null };
  if (cn.selfie_by === meId) return { selfie: url, selfieStatus: "pending", selfieRequest: null };
  return { selfie: null, selfieStatus: "request", selfieRequest: url };
}
