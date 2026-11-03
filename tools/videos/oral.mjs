// Version dite d'un texte pour la voix de synthèse (vidéos « QCM du jour », « L'article du jour ») : sigles développés
// ou épelés, numéros de loi remplacés par l'année, mentions de source omises, parenthèses lues comme des incises.
const SIGLES = [
  [/\bl'AUDCG\b/g, "l'Acte uniforme sur le droit commercial général"], [/\bAUDCG\b/g, 'Acte uniforme sur le droit commercial général'],
  [/\bl'AUSCGIE\b/g, "l'Acte uniforme sur les sociétés commerciales"], [/\bAUSCGIE\b/g, 'Acte uniforme sur les sociétés commerciales'],
  [/\bl'AUPSRVE\b/g, "l'Acte uniforme sur les procédures simplifiées de recouvrement"], [/\bAUPSRVE\b/g, 'Acte uniforme sur les procédures simplifiées de recouvrement'],
  [/\bl'AUPC\b/g, "l'Acte uniforme sur les procédures collectives"], [/\bAUPC\b/g, 'Acte uniforme sur les procédures collectives'],
  [/\bl'AUS\b/g, "l'Acte uniforme sur les sûretés"], [/\bAUS\b/g, 'Acte uniforme sur les sûretés'],
  [/\bCADBE\b/g, "Charte africaine des droits et du bien-être de l'enfant"],
  [/\bFCFA\b/g, 'francs CFA'], [/\bCFA\b/g, 'C F A'], [/\bOHADA\b/g, 'Ohada'], [/\bCEDEAO\b/g, 'Cédéao'], [/\bUEMOA\b/g, 'Uémoa'],
  [/\bERSUMA\b/g, 'Ersuma'], [/\bSATMACI\b/g, 'Satmaci'],
  [/\bRCCM\b/g, 'R C C M'], [/\bCCJA\b/g, 'C C J A'], [/\bOUA\b/g, 'O U A'], [/\bGIE\b/g, 'G I E'], [/\bSARL\b/g, 'S A R L'],
  [/\bBCEAO\b/g, 'B C E A O'], [/\bSNC\b/g, 'S N C'], [/\bCRPC\b/g, 'C R P C'], [/\bBAD\b/g, 'B A D'], [/\bINFJ\b/g, 'I N F J'], [/\bENA\b/g, 'E N A'], [/\bQCM\b/g, 'Q C M'], [/coursesesame\.com/g, 'cours sésame point com']
];
export function oral(t) {
  let s = t.replace(/\s*Sources? : [^.]*\.?/g, '').replace(/\s*\([^)]*source[^)]*\)/gi, '').replace(/\s*\(([^)]*)\)/g, ', $1,').replace(/,\s*\?/g, ' ?').replace(/,\s*([.;:])/g, '$1');
  s = s.replace(/n° ?\d{4}-\d+,?(?= du )/g, '').replace(/n° ?(\d{4})-\d+/g, 'de $1').replace(/n° ?(\d{2})-\d+/g, 'de 19$1');
  s = s.replace(/\b1er\b/g, 'premier').replace(/(\d)\.(?=\d{3}\b)/g, '$1').replace(/\s+/g, ' ').replace(/ ,/g, ',').trim();
  for (const [a, b] of SIGLES) s = s.replace(a, b);
  return s;
}
