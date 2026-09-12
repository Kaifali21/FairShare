import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase';

const normalizeUsername = value => value.trim().toLowerCase().replace(/\s+/g, '');

const authErrorMessage = error => {
  const messages = {
    'auth/invalid-credential': 'No matching account was found, or the password is incorrect.',
    'auth/user-not-found': 'No account exists with this email address. Create an account first.',
    'auth/wrong-password': 'The password is incorrect. Try again or use Forgot password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled. Contact the administrator.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again later.',
  };
  return messages[error.code] || error.message.replace('Firebase: ', '').replace(/ \(auth\/.*\)\.?/, '');
};

function Field({ label, value, onChangeText, secureTextEntry, keyboardType }) {
  return <View style={styles.fieldGroup}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={onChangeText} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize="none" placeholderTextColor="#8d918c" /></View>;
}

function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');

  const resetPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email', 'Type your account email first, then tap Forgot password.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Reset link sent', `Check ${email.trim()} for instructions to create a new password.`);
    } catch (error) {
      Alert.alert('Could not send reset link', error.message.replace('Firebase: ', '').replace(/ \(auth\/.*\)\.?/, ''));
    }
  };

  const submit = async () => {
    const cleanUsername = normalizeUsername(username);
    if (!email.trim() || password.length < 6 || (mode === 'register' && !cleanUsername)) {
      Alert.alert('Check your details', 'Use a valid email, a password with 6+ characters, and complete every field.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (!credential.user.emailVerified) {
          await sendEmailVerification(credential.user);
          await signOut(auth);
          setVerificationMessage('Your email is not verified yet. A new confirmation link was sent.');
          setMode('verify');
          return;
        }
      } else {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: cleanUsername });
        const userRef = doc(db, 'users', credential.user.uid);
        const usernameRef = doc(db, 'usernames', cleanUsername);
        await runTransaction(db, async transaction => {
          if ((await transaction.get(usernameRef)).exists()) throw new Error('That username is already taken.');
          transaction.set(userRef, { uid: credential.user.uid, email: email.trim(), username: cleanUsername, householdId: null, createdAt: serverTimestamp() });
          transaction.set(usernameRef, { uid: credential.user.uid });
        });
        await sendEmailVerification(credential.user);
        await signOut(auth);
        setVerificationMessage(`A confirmation link was sent to ${email.trim()}.`);
        setMode('verify');
      }
    } catch (error) {
      Alert.alert(mode === 'login' ? 'Unable to log in' : 'Unable to create account', authErrorMessage(error));
    } finally { setBusy(false); }
  };

  if (mode === 'verify') return <SafeAreaView style={styles.safe}><View style={styles.authContent}><Text style={styles.eyebrow}>CHECK YOUR EMAIL</Text><Text style={styles.heroTitle}>Confirm your account.</Text><Text style={styles.heroCopy}>{verificationMessage || `We sent a confirmation link to ${email.trim()}.`}</Text><Text style={styles.heroCopy}>Open the link in your email before logging in. If you do not see it, check your Spam or Junk folder.</Text><TouchableOpacity style={styles.primaryButton} onPress={() => { setMode('login'); setVerificationMessage(''); }}><Text style={styles.primaryButtonText}>Go to login</Text></TouchableOpacity><TouchableOpacity onPress={async () => { try { const credential = await signInWithEmailAndPassword(auth, email.trim(), password); await sendEmailVerification(credential.user); await signOut(auth); Alert.alert('Confirmation link sent', 'Check your inbox and Spam folder.'); } catch (error) { Alert.alert('Could not resend link', error.message.replace('Firebase: ', '').replace(/ \(auth\/.*\)\.?/, '')); } }}><Text style={styles.switchText}>Resend confirmation email</Text></TouchableOpacity></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.authContent}>
    <Text style={styles.eyebrow}>FAIRSHARE</Text><Text style={styles.heroTitle}>{mode === 'login' ? 'Welcome back.' : 'Start your household.'}</Text><Text style={styles.heroCopy}>{mode === 'login' ? 'Keep every shared cost in one clear place.' : 'You will become the household admin and can add your roommates.'}</Text>
    {mode === 'register' && <Field label="Username" value={username} onChangeText={setUsername} />}<Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" /><Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />{mode === 'login' && <TouchableOpacity onPress={resetPassword}><Text style={{ color: '#1f6f5b', fontSize: 14, fontWeight: '700', marginBottom: 8 }}>Forgot password?</Text></TouchableOpacity>}
    <TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{mode === 'login' ? 'Log in' : 'Create account'}</Text>}</TouchableOpacity><TouchableOpacity onPress={() => setMode(mode === 'login' ? 'register' : 'login')}><Text style={styles.switchText}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}</Text></TouchableOpacity>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function HouseholdSetup({ user, profile, onComplete }) {
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [mode, setMode] = useState('choose');
  const [busy, setBusy] = useState(false);
  const createInviteCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
  const createHousehold = async () => {
    if (!name.trim()) return Alert.alert('Add a name', 'Give your expense tracker a household name.');
    setBusy(true);
    try {
      const householdRef = doc(collection(db, 'households'));
      const code = createInviteCode();
      await runTransaction(db, async transaction => {
        transaction.set(householdRef, { name: name.trim(), adminId: user.uid, inviteCode: code, createdAt: serverTimestamp() });
        transaction.set(doc(db, 'householdCodes', code), { householdId: householdRef.id, adminId: user.uid });
        transaction.set(doc(db, 'users', user.uid), { householdId: householdRef.id }, { merge: true });
        transaction.set(doc(db, 'households', householdRef.id, 'members', user.uid), { uid: user.uid, username: profile.username, email: profile.email, role: 'admin', joinedAt: serverTimestamp() });
      });
      onComplete({ ...profile, householdId: householdRef.id, householdName: name.trim(), inviteCode: code, role: 'admin' });
    } catch (error) { Alert.alert('Could not create household', error.message); } finally { setBusy(false); }
  };
  const joinHousehold = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return Alert.alert('Enter an invite code', 'Ask the household admin for their six-character code.');
    setBusy(true);
    try {
      const codeSnapshot = await getDoc(doc(db, 'householdCodes', code));
      if (!codeSnapshot.exists()) throw new Error('That invite code is not valid.');
      const householdId = codeSnapshot.data().householdId;
      const householdSnapshot = await getDoc(doc(db, 'households', householdId));
      if (!householdSnapshot.exists()) throw new Error('That household no longer exists.');
      await runTransaction(db, async transaction => {
        transaction.set(doc(db, 'users', user.uid), { householdId }, { merge: true });
        transaction.set(doc(db, 'households', householdId, 'members', user.uid), { uid: user.uid, username: profile.username, email: profile.email, role: 'member', joinedAt: serverTimestamp() });
      });
      onComplete({ ...profile, householdId, householdName: householdSnapshot.data().name, role: 'member', inviteCode: householdSnapshot.data().inviteCode });
    } catch (error) { Alert.alert('Could not join household', error.message); } finally { setBusy(false); }
  };
  if (mode === 'choose') return <SafeAreaView style={styles.safe}><View style={styles.authContent}><Text style={styles.eyebrow}>ACCOUNT READY</Text><Text style={styles.heroTitle}>Where do you belong?</Text><Text style={styles.heroCopy}>Create a new shared tracker or join one using an invite code from its admin.</Text><TouchableOpacity style={styles.primaryButton} onPress={() => setMode('create')}><Text style={styles.primaryButtonText}>Create a household</Text></TouchableOpacity><TouchableOpacity style={styles.secondaryButton} onPress={() => setMode('join')}><Text style={styles.secondaryButtonText}>Join a household</Text></TouchableOpacity></View></SafeAreaView>;
  return <SafeAreaView style={styles.safe}><View style={styles.authContent}><Text style={styles.eyebrow}>{mode === 'create' ? 'NEW HOUSEHOLD' : 'JOIN HOUSEHOLD'}</Text><Text style={styles.heroTitle}>{mode === 'create' ? 'Create your tracker.' : 'Enter your invite code.'}</Text><Text style={styles.heroCopy}>{mode === 'create' ? 'You will become the household admin.' : 'Ask the household admin for the six-character code.'}</Text>{mode === 'create' ? <Field label="Household name" value={name} onChangeText={setName} /> : <Field label="Invite code" value={inviteCode} onChangeText={setInviteCode} />}<TouchableOpacity style={styles.primaryButton} onPress={mode === 'create' ? createHousehold : joinHousehold} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{mode === 'create' ? 'Create household' : 'Join household'}</Text>}</TouchableOpacity><TouchableOpacity onPress={() => setMode('choose')}><Text style={styles.switchText}>Back</Text></TouchableOpacity></View></SafeAreaView>;
}

function Dashboard({ user, profile }) {
  const [members, setMembers] = useState([]); const [expenses, setExpenses] = useState([]); const [memberUsername, setMemberUsername] = useState(''); const [purpose, setPurpose] = useState(''); const [amount, setAmount] = useState(''); const [editingExpenseId, setEditingExpenseId] = useState(null); const [showBalances, setShowBalances] = useState(false); const [showHouseholdMenu, setShowHouseholdMenu] = useState(false); const [loading, setLoading] = useState(true);
  const loadData = async () => { const membersSnapshot = await getDocs(collection(db, 'households', profile.householdId, 'members')); const expensesSnapshot = await getDocs(query(collection(db, 'households', profile.householdId, 'expenses'), where('deleted', '==', false))); setMembers(membersSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))); setExpenses(expensesSnapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))); setLoading(false); };
  useEffect(() => { loadData().catch(error => Alert.alert('Could not load household', error.message)); }, [profile.householdId]);
  const addMember = async () => { const cleanUsername = normalizeUsername(memberUsername); if (!cleanUsername) return; try { const usernameSnapshot = await getDoc(doc(db, 'usernames', cleanUsername)); if (!usernameSnapshot.exists()) throw new Error('No account has that username yet.'); const invitedUid = usernameSnapshot.data().uid; const invitedUserRef = doc(db, 'users', invitedUid); const invitedUser = await getDoc(invitedUserRef); if (!invitedUser.exists() || invitedUser.data().householdId) throw new Error('That user already belongs to a household.'); const invited = invitedUser.data(); await setDoc(invitedUserRef, { householdId: profile.householdId }, { merge: true }); await setDoc(doc(db, 'households', profile.householdId, 'members', invitedUid), { uid: invitedUid, username: invited.username, email: invited.email, role: 'member', joinedAt: serverTimestamp() }); setMemberUsername(''); await loadData(); } catch (error) { Alert.alert('Could not add member', error.message); } };
  const removeMember = member => Alert.alert('Remove member?', `${member.username} will leave this household.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: async () => { await deleteDoc(doc(db, 'households', profile.householdId, 'members', member.uid)); await setDoc(doc(db, 'users', member.uid), { householdId: null }, { merge: true }); await loadData(); } }]);
  const saveExpense = async () => { const numericAmount = Number(amount); if (!purpose.trim() || !numericAmount || numericAmount < 0) return Alert.alert('Check expense', 'Enter a purpose and a positive amount.'); const expenseData = { purpose: purpose.trim(), amount: numericAmount }; if (editingExpenseId) await updateDoc(doc(db, 'households', profile.householdId, 'expenses', editingExpenseId), expenseData); else await addDoc(collection(db, 'households', profile.householdId, 'expenses'), { ...expenseData, paidBy: user.uid, paidByName: profile.username, deleted: false, createdAt: serverTimestamp() }); setPurpose(''); setAmount(''); setEditingExpenseId(null); await loadData(); };
  const editExpense = expense => { setEditingExpenseId(expense.id); setPurpose(expense.purpose); setAmount(String(expense.amount)); };
  const removeExpense = expense => Alert.alert('Delete expense?', `${expense.purpose} will be removed for everyone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteDoc(doc(db, 'households', profile.householdId, 'expenses', expense.id)); await loadData(); } }]);
  const removeAllExpenses = () => Alert.alert('Delete all expenses?', 'This will permanently remove every household expense for everyone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete all', style: 'destructive', onPress: async () => { const snapshot = await getDocs(collection(db, 'households', profile.householdId, 'expenses')); const batch = writeBatch(db); snapshot.docs.forEach(expense => batch.delete(expense.ref)); await batch.commit(); await loadData(); } }]);
  const totals = useMemo(() => members.map(member => ({ ...member, total: expenses.filter(expense => expense.paidBy === member.uid).reduce((sum, expense) => sum + expense.amount, 0) })), [members, expenses]); const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const settlements = useMemo(() => { if (!members.length || !total) return []; const share = total / members.length; const creditors = totals.filter(member => member.total > share + 0.01).map(member => ({ name: member.username, amount: member.total - share })); const debtors = totals.filter(member => member.total < share - 0.01).map(member => ({ name: member.username, amount: share - member.total })); const transfers = []; let debtorIndex = 0; let creditorIndex = 0; while (debtorIndex < debtors.length && creditorIndex < creditors.length) { const transferAmount = Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount); transfers.push(`${debtors[debtorIndex].name} pays ${creditors[creditorIndex].name} ₹${transferAmount.toFixed(2)}`); debtors[debtorIndex].amount -= transferAmount; creditors[creditorIndex].amount -= transferAmount; if (debtors[debtorIndex].amount < 0.01) debtorIndex += 1; if (creditors[creditorIndex].amount < 0.01) creditorIndex += 1; } return transfers; }, [members.length, total, totals]);
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1f6f5b" /></View>;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.dashboard}>
    <View style={styles.headerRow}><View><Text style={styles.eyebrow}>HOUSEHOLD</Text><TouchableOpacity disabled={profile.role !== 'admin'} onPress={() => setShowHouseholdMenu(value => !value)}><Text style={styles.title}>{profile.householdName}{profile.role === 'admin' ? '  ▾' : ''}</Text></TouchableOpacity><Text style={styles.muted}>Invite code: {profile.inviteCode || 'Ask admin'}</Text></View><TouchableOpacity onPress={() => signOut(auth)}><Text style={styles.link}>Log out</Text></TouchableOpacity></View>
    {profile.role === 'admin' && showHouseholdMenu && <View style={{ backgroundColor: '#fffdf8', borderColor: '#ded9cc', borderRadius: 8, borderWidth: 1, marginBottom: 18, padding: 16 }}><Text style={{ color: '#18221d', fontSize: 17, fontWeight: '800', marginBottom: 5 }}>Manage members</Text><Text style={styles.muted}>Add or remove people from this household.</Text><View style={styles.inline}><TextInput style={[styles.input, styles.inlineInput]} placeholder="username" placeholderTextColor="#8d918c" value={memberUsername} onChangeText={setMemberUsername} autoCapitalize="none" /><TouchableOpacity style={styles.smallButton} onPress={addMember}><Text style={styles.smallButtonText}>Add</Text></TouchableOpacity></View>{members.filter(member => member.uid !== user.uid).map(member => <View style={{ alignItems: 'center', borderTopColor: '#ded9cc', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 12 }} key={member.uid}><Text style={styles.memberName}>{member.username}</Text><TouchableOpacity onPress={() => removeMember(member)}><Text style={styles.deleteLink}>Remove</Text></TouchableOpacity></View>)}</View>}
    <View style={styles.totalCard}><Text style={styles.cardLabel}>TOTAL SPENT</Text><Text style={styles.totalAmount}>₹{total.toFixed(2)}</Text><Text style={styles.muted}>{expenses.length} shared expense{expenses.length === 1 ? '' : 's'}</Text><Text style={{ color: '#cce4d7', fontSize: 12, fontWeight: '800', marginTop: 18 }}>PAID BY</Text>{totals.map(member => <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }} key={member.uid}><Text style={{ color: '#fff', fontSize: 14 }}>{member.username}</Text><Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>₹{member.total.toFixed(2)}</Text></View>)}</View>
    <Text style={styles.sectionTitle}>{editingExpenseId ? 'Edit expense' : 'Add expense'}</Text><Field label="Purpose" value={purpose} onChangeText={setPurpose} /><Field label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /><TouchableOpacity style={styles.primaryButton} onPress={saveExpense}><Text style={styles.primaryButtonText}>{editingExpenseId ? 'Save changes' : 'Add expense'}</Text></TouchableOpacity>{editingExpenseId && <TouchableOpacity onPress={() => { setEditingExpenseId(null); setPurpose(''); setAmount(''); }}><Text style={styles.switchText}>Cancel editing</Text></TouchableOpacity>}
    {profile.role === 'admin' && <TouchableOpacity style={{ alignItems: 'center', borderColor: '#b4533c', borderRadius: 8, borderWidth: 1, marginTop: 22, padding: 14 }} onPress={removeAllExpenses}><Text style={{ color: '#b4533c', fontWeight: '800' }}>Delete all expenses</Text></TouchableOpacity>}
    <TouchableOpacity style={{ alignItems: 'center', borderColor: '#1f6f5b', borderRadius: 8, borderWidth: 1, marginTop: 22, padding: 14 }} onPress={() => setShowBalances(value => !value)}><Text style={{ color: '#1f6f5b', fontWeight: '800' }}>{showBalances ? 'Hide balances' : 'Calculate who pays whom'}</Text></TouchableOpacity>{showBalances && <View style={{ backgroundColor: '#e5efe8', borderRadius: 8, marginTop: 14, padding: 16 }}><Text style={{ color: '#18221d', fontSize: 17, fontWeight: '800', marginBottom: 6 }}>Settlement</Text><Text style={styles.muted}>Each person’s fair share: ₹{members.length ? (total / members.length).toFixed(2) : '0.00'}</Text>{settlements.length ? settlements.map(transfer => <Text style={{ color: '#18221d', fontSize: 15, fontWeight: '700', marginTop: 10 }} key={transfer}>{transfer}</Text>) : <Text style={{ color: '#18221d', fontSize: 15, fontWeight: '700', marginTop: 10 }}>Everyone is settled up.</Text>}</View>}
    <Text style={styles.sectionTitle}>Recent expenses</Text><FlatList scrollEnabled={false} data={expenses} keyExtractor={item => item.id} ListEmptyComponent={<Text style={styles.muted}>No expenses yet.</Text>} renderItem={({ item }) => { const canManage = profile.role === 'admin' || item.paidBy === user.uid; return <View style={styles.expenseRow}><View style={styles.expenseDetails}><Text style={styles.memberName}>{item.purpose}</Text><Text style={styles.muted}>Paid by {item.paidByName}</Text></View><View style={styles.expenseActions}><Text style={styles.memberTotal}>₹{item.amount.toFixed(2)}</Text>{canManage && <View style={styles.actionRow}><TouchableOpacity onPress={() => editExpense(item)}><Text style={styles.editLink}>Edit</Text></TouchableOpacity><TouchableOpacity onPress={() => removeExpense(item)}><Text style={styles.deleteLink}>Delete</Text></TouchableOpacity></View>}</View></View>; }} />
  </ScrollView></SafeAreaView>;
}

export default function App() {
  const [user, setUser] = useState(null); const [profile, setProfile] = useState(null); const [loading, setLoading] = useState(true);
  useEffect(() => onAuthStateChanged(auth, async currentUser => {
    setUser(currentUser);
    try {
      if (!currentUser) {
        setProfile(null);
        return;
      }
      const snapshot = await getDoc(doc(db, 'users', currentUser.uid));
      if (!snapshot.exists()) {
        setProfile(null);
        return;
      }
      const data = snapshot.data();
      if (!data.householdId) {
        setProfile(data);
        return;
      }
      const household = await getDoc(doc(db, 'households', data.householdId));
      const membership = await getDoc(doc(db, 'households', data.householdId, 'members', currentUser.uid));
      setProfile({ ...data, role: membership.data()?.role || 'member', householdName: household.data()?.name || 'My household', inviteCode: household.data()?.inviteCode });
    } catch (error) {
      setProfile(null);
      Alert.alert('Firebase connection error', error.message || 'Could not load your account.');
    } finally {
      setLoading(false);
    }
  }), []);
  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#1f6f5b" /></View>;
  return user && profile?.householdId ? <Dashboard user={user} profile={profile} /> : user && profile ? <HouseholdSetup user={user} profile={profile} onComplete={setProfile} /> : <AuthScreen />;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#f4f1e9' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f1e9' }, authContent: { flexGrow: 1, justifyContent: 'center', padding: 28 }, dashboard: { padding: 22, paddingBottom: 42 }, eyebrow: { color: '#1f6f5b', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 }, heroTitle: { color: '#18221d', fontSize: 42, fontWeight: '800', marginTop: 12, marginBottom: 10 }, heroCopy: { color: '#59645c', fontSize: 16, lineHeight: 24, marginBottom: 34 }, title: { color: '#18221d', fontSize: 28, fontWeight: '800', marginTop: 5 }, fieldGroup: { marginBottom: 16 }, label: { color: '#59645c', fontSize: 12, fontWeight: '800', marginBottom: 7, textTransform: 'uppercase' }, input: { backgroundColor: '#fffdf8', borderColor: '#ded9cc', borderRadius: 8, borderWidth: 1, color: '#18221d', fontSize: 16, paddingHorizontal: 14, paddingVertical: 13 }, primaryButton: { alignItems: 'center', backgroundColor: '#1f6f5b', borderRadius: 8, marginTop: 8, padding: 15 }, primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' }, switchText: { color: '#1f6f5b', fontSize: 14, fontWeight: '700', paddingVertical: 22, textAlign: 'center' }, headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }, link: { color: '#b4533c', fontWeight: '800' }, totalCard: { backgroundColor: '#1f6f5b', borderRadius: 12, marginBottom: 28, padding: 22 }, cardLabel: { color: '#cce4d7', fontSize: 12, fontWeight: '800', letterSpacing: 1 }, totalAmount: { color: '#fff', fontSize: 38, fontWeight: '800', marginVertical: 8 }, muted: { color: '#768077', fontSize: 13 }, sectionTitle: { color: '#18221d', fontSize: 20, fontWeight: '800', marginBottom: 14, marginTop: 24 }, inline: { alignItems: 'center', flexDirection: 'row', gap: 8 }, inlineInput: { flex: 1 }, smallButton: { backgroundColor: '#b4533c', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 14 }, smallButtonText: { color: '#fff', fontWeight: '800' }, memberRow: { alignItems: 'center', borderBottomColor: '#ded9cc', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 }, memberName: { color: '#18221d', fontSize: 16, fontWeight: '700', marginBottom: 4 }, memberTotal: { color: '#1f6f5b', fontSize: 17, fontWeight: '800' }, expenseRow: { alignItems: 'center', backgroundColor: '#fffdf8', borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, padding: 15 }, expenseDetails: { flex: 1 }, expenseActions: { alignItems: 'flex-end' }, actionRow: { flexDirection: 'row', gap: 12, marginTop: 8 }, editLink: { color: '#1f6f5b', fontSize: 13, fontWeight: '800' }, deleteLink: { color: '#b4533c', fontSize: 13, fontWeight: '800' } });
