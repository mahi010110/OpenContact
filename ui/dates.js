/* ============================================================
   OpenContact — interface · dates du quotidien
   Tout ce qui traduit une date ISO en langage d'écran (« demain »,
   « –5 j », « jeu. 03/07 ») et les raccourcis de planification.
   ============================================================ */
import { todayISO } from '../engine/utils.js';

export function plusDaysISO(n){
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
export function nextMondayISO(){
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}
/* écart en jours par rapport à aujourd'hui (négatif = passé) */
export function diffDays(iso){
  return Math.round((new Date(iso + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / 86400000);
}
/* « jeu. 03/07 » */
export function frDate(iso){
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
/* « mardi 8 juillet » */
export function frToday(){
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
/* étiquette relative courte : « –5 j » · « aujourd'hui » · « demain » · « +12 j » */
export function relLabel(iso){
  const n = diffDays(iso);
  if (n === 0) return 'aujourd’hui';
  if (n === 1) return 'demain';
  return (n > 0 ? '+' : '–') + Math.abs(n) + ' j';
}
