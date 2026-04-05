/**
 * BudgetSheet — budget tracking bottom sheet (W12).
 * Wires to existing /api/trips/{id}/expenses + /api/trips/{id}/budget endpoints.
 */
import { useState } from "react";
import {
  ActivityIndicator, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";

type Cat = "accommodation"|"food"|"transport"|"activities"|"shopping"|"other";
interface Expense { id: string; title: string; amount: number; currency: string; category: Cat; date: string; }

const CATS: Cat[] = ["accommodation","food","transport","activities","shopping","other"];
const ICONS: Record<Cat, string> = { accommodation:"🏨", food:"🍜", transport:"🚗", activities:"🎭", shopping:"🛍️", other:"📎" };

function money(a: number, c: string) {
  try { return new Intl.NumberFormat(undefined,{style:"currency",currency:c,maximumFractionDigits:2}).format(a); }
  catch { return `${c} ${a.toFixed(2)}`; }
}

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: {"Content-Type":"application/json"}, ...opts });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error?.message ?? "Request failed");
  return j.data as T;
}

export default function BudgetSheet({
  tripId, userId, visible, onClose,
}: { tripId: string; userId?: string; visible: boolean; onClose: () => void; }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState<Cat>("other");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");

  if (visible && !loaded) {
    setLoaded(true);
    setLoading(true);
    api<{ expenses: Expense[]; budget: number | null; currency: string }>(
      `/api/trips/${tripId}/expenses${userId ? `?user_id=${userId}` : ""}`
    ).then(d => { setExpenses(d.expenses); setBudget(d.budget); setCurrency(d.currency); })
     .catch(() => setError("Could not load budget."))
     .finally(() => setLoading(false));
  }
  if (!visible && loaded) setLoaded(false);

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  async function handleAdd() {
    const a = parseFloat(amount);
    if (!label.trim()) { setAddErr("Enter a description"); return; }
    if (isNaN(a) || a <= 0) { setAddErr("Enter a valid amount"); return; }
    setAddErr(""); setAdding(true);
    try {
      const e = await api<Expense>(`/api/trips/${tripId}/expenses`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId ?? null, title: label.trim(), amount: a, paid_by_name: "Me", category: cat }),
      });
      setExpenses(prev => [...prev, e]);
      setLabel(""); setAmount(""); setCat("other");
    } catch { setAddErr("Could not add expense."); }
    finally { setAdding(false); }
  }

  async function handleDelete(id: string, amt: number) {
    await api(`/api/trips/${tripId}/expenses/${id}?user_id=${userId ?? ""}`, { method: "DELETE" });
    setExpenses(prev => prev.filter(e => e.id !== id));
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.hdr}>
            <Text style={s.title}>💰 Budget</Text>
            <TouchableOpacity onPress={onClose}><Text style={s.x}>✕</Text></TouchableOpacity>
          </View>
          {loading && <View style={s.center}><ActivityIndicator color="#6366f1" size="large" /></View>}
          {error && <View style={s.center}><Text style={s.errTxt}>{error}</Text></View>}
          {!loading && !error && (
            <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
              <View style={s.totalRow}>
                <Text style={s.totalLbl}>Total spent</Text>
                <Text style={s.totalVal}>{money(total, currency)}</Text>
              </View>
              {budget !== null && (
                <View style={s.trackBg}>
                  <View style={[s.trackFill, { width: `${Math.min((total/budget)*100,100)}%` as unknown as number }]} />
                </View>
              )}

              {expenses.length > 0 && (
                <View style={s.listBlock}>
                  <Text style={s.secLbl}>EXPENSES</Text>
                  {[...expenses].reverse().map(e => (
                    <View key={e.id} style={s.item}>
                      <Text style={s.itemIcon}>{ICONS[e.category] ?? "📎"}</Text>
                      <Text style={s.itemTitle} numberOfLines={1}>{e.title}</Text>
                      <Text style={s.itemAmt}>{money(e.amount, currency)}</Text>
                      <TouchableOpacity onPress={() => handleDelete(e.id, e.amount)}>
                        <Text style={s.del}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Text style={s.secLbl}>ADD EXPENSE</Text>
              <TextInput style={s.input} placeholder="Description" value={label} onChangeText={setLabel} maxLength={200} />
              <TextInput style={s.input} placeholder={`Amount (${currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
                {CATS.map(c => (
                  <TouchableOpacity key={c} style={[s.catChip, cat===c && s.catChipSel]} onPress={() => setCat(c)}>
                    <Text style={[s.catTxt, cat===c && s.catTxtSel]}>{ICONS[c]} {c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {addErr ? <Text style={s.errTxt}>{addErr}</Text> : null}
              <TouchableOpacity style={[s.addBtn, adding && s.addBtnDis]} onPress={handleAdd} disabled={adding} activeOpacity={0.85}>
                <Text style={s.addTxt}>{adding ? "Adding…" : "+ Add expense"}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex:1, backgroundColor:"rgba(0,0,0,0.5)", justifyContent:"flex-end" },
  sheet: { backgroundColor:"#fff", borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:"90%", paddingBottom:32 },
  handle: { width:36, height:4, borderRadius:2, backgroundColor:"#d1d5db", alignSelf:"center", marginTop:10 },
  hdr: { flexDirection:"row", justifyContent:"space-between", alignItems:"center", padding:20, paddingBottom:12 },
  title: { fontSize:18, fontWeight:"800", color:"#111827" },
  x: { fontSize:18, color:"#9ca3af" },
  center: { alignItems:"center", paddingVertical:40, gap:12 },
  errTxt: { color:"#dc2626", fontSize:13 },
  body: { padding:20, gap:14 },
  totalRow: { flexDirection:"row", justifyContent:"space-between", alignItems:"baseline" },
  totalLbl: { fontSize:14, color:"#6b7280" },
  totalVal: { fontSize:28, fontWeight:"800", color:"#111827", letterSpacing:-0.5 },
  trackBg: { height:8, backgroundColor:"#f3f4f6", borderRadius:4, overflow:"hidden" },
  trackFill: { height:8, backgroundColor:"#6366f1", borderRadius:4 },
  listBlock: { gap:8 },
  secLbl: { fontSize:11, fontWeight:"700", color:"#9ca3af", letterSpacing:0.6 },
  item: { flexDirection:"row", alignItems:"center", backgroundColor:"#f9fafb", borderRadius:10, padding:10, gap:8 },
  itemIcon: { fontSize:18 },
  itemTitle: { flex:1, fontSize:13, fontWeight:"600", color:"#111827" },
  itemAmt: { fontSize:13, fontWeight:"700", color:"#374151" },
  del: { fontSize:13, color:"#d1d5db", padding:2 },
  input: { borderWidth:1.5, borderColor:"#d1d5db", borderRadius:8, padding:10, fontSize:13, color:"#111827" },
  catRow: { gap:6 },
  catChip: { borderWidth:1.5, borderColor:"#d1d5db", borderRadius:20, paddingHorizontal:10, paddingVertical:5 },
  catChipSel: { backgroundColor:"#6366f1", borderColor:"#6366f1" },
  catTxt: { fontSize:12, color:"#374151", fontWeight:"500" },
  catTxtSel: { color:"#fff" },
  addBtn: { backgroundColor:"#6366f1", borderRadius:10, paddingVertical:13, alignItems:"center" },
  addBtnDis: { opacity:0.55 },
  addTxt: { color:"#fff", fontSize:15, fontWeight:"700" },
});
