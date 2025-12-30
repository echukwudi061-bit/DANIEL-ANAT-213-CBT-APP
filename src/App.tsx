import { db, auth } from './firebase';
import { 
  Play, Clock, CheckCircle, XCircle, Menu, X, LogOut, User, Shield, 
  FileText, BarChart, Upload, Trash2, ChevronLeft, ChevronRight, 
  List, Edit2, AlertTriangle, Check, Settings as SettingsIcon, Lock, Type
} from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { 
  getFirestore, collection, doc, setDoc, updateDoc, deleteDoc, 
  onSnapshot, writeBatch, query, where, getDocs 
} from "firebase/firestore";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyCyyG8ELDWDzWfyxhZBggRoIQ4taDIO-nk",
  authDomain: "danielo-s-project-524d0.firebaseapp.com",
  projectId: "danielo-s-project-524d0",
  storageBucket: "danielo-s-project-524d0.firebasestorage.app",
  messagingSenderId: "728041872480",
  appId: "1:728041872480:web:49fbba681bb32aa22eb705",
  measurementId: "G-FF4GP5L2Z0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "anatomy-cbt-v1";

// --- Types ---
type OptionKey = 'optionA' | 'optionB' | 'optionC' | 'optionD';

interface Question {
  id: string;
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: OptionKey; 
}

interface TestSettings {
  durationMinutes: number;
  marksPerQuestion: number;
  appName: string;
  testTitle: string;
  adminPassword: string;
}

interface Submission {
  id: string;
  userId: string;
  guestId: string;
  score: number;
  totalQuestions: number;
  answers: Record<string, OptionKey>;
  status: 'started' | 'completed';
  startTime: number;
  endTime?: number;
  questionOrder: string[]; 
}

// --- Components ---
const Modal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "Confirm", isDestructive = false }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg">Cancel</button>
          <button type="button" onClick={onConfirm} className={`px-4 py-2 text-white rounded-lg font-bold ${isDestructive ? 'bg-red-600' : 'bg-blue-600'}`}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
};

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className={`fixed top-4 right-4 z-[70] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white font-medium ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
      {message}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'welcome' | 'test' | 'result' | 'admin'>('welcome');
  const [guestId, setGuestId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [confirmAction, setConfirmAction] = useState<{isOpen: boolean; title: string; message: string; onConfirm: () => void; isDestructive?: boolean;}>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [adminTab, setAdminTab] = useState<'stats' | 'questions' | 'results'>('stats');
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  
  const defaultSettings: TestSettings = { 
    durationMinutes: 20, marksPerQuestion: 2, appName: "DANIEL'S ANATOMY CBT", 
    testTitle: "ANAT 213: GENERAL EMBRYO AND GENETICS", 
    adminPassword: "BrainyBlessing08148800047" 
  };
  const [settings, setSettings] = useState<TestSettings>(defaultSettings);
  const [tempSettings, setTempSettings] = useState<TestSettings>(defaultSettings);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentSubmission, setCurrentSubmission] = useState<Submission | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [adminStats, setAdminStats] = useState({ active: 0, total: 0, completed: 0 });
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20 * 60); 
  const [answers, setAnswers] = useState<Record<string, OptionKey>>({});
  const [testQuestions, setTestQuestions] = useState<Question[]>([]); 

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type });

  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        let id = localStorage.getItem(`guestId_${appId}`) || `GUEST-${Math.floor(Math.random() * 10000)}`;
        localStorage.setItem(`guestId_${appId}`, id);
        setGuestId(id);
      } else {
        signInAnonymously(auth);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'), (snap) => {
      if (snap.exists()) { setSettings(snap.data() as TestSettings); setTempSettings(snap.data() as TestSettings); }
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'questions'), (snap) => {
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
    });
    return () => unsub();
  }, [user]);

  const startTest = async () => {
    if (questions.length === 0) return showToast("No questions available", "error");
    const shuffled = [...questions].sort(() => 0.5 - Math.random()).slice(0, 50);
    setTestQuestions(shuffled);
    const subId = `${user.uid}_${Date.now()}`;
    const newSub: Submission = { 
      id: subId, userId: user.uid, guestId, score: 0, totalQuestions: shuffled.length, 
      answers: {}, status: 'started', startTime: Date.now(), questionOrder: shuffled.map(q => q.id) 
    };
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'submissions', subId), newSub);
    setCurrentSubmission(newSub);
    setTimeLeft(settings.durationMinutes * 60);
    setView('test');
  };

  const handleRealSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    let score = 0;
    testQuestions.forEach(q => { if (answers[q.id] === q.correctAnswer) score += settings.marksPerQuestion; });
    const final = { ...currentSubmission!, answers, score, status: 'completed' as const, endTime: Date.now() };
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'submissions', currentSubmission!.id), final);
    setCurrentSubmission(final);
    setView('result');
    setIsSubmitting(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <Modal isOpen={confirmAction.isOpen} title={confirmAction.title} message={confirmAction.message} onConfirm={confirmAction.onConfirm} onCancel={() => setConfirmAction({...confirmAction, isOpen: false})} />

      {view === 'welcome' && (
        <div className="flex flex-col items-center justify-center h-screen p-6">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
            <h1 className="text-2xl font-bold mb-4">{settings.appName}</h1>
            <p className="mb-6 text-blue-600 font-bold uppercase">{settings.testTitle}</p>
            <button onClick={startTest} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg">Start Test</button>
            <div className="mt-8 pt-4 border-t">
              <input id="adminPass" type="password" placeholder="Admin Password" className="w-full border p-2 rounded mb-2" />
              <button onClick={() => {
                const p = (document.getElementById('adminPass') as HTMLInputElement).value;
                if(p === settings.adminPassword) { setIsAdmin(true); setView('admin'); } else { showToast("Wrong password", "error"); }
              }} className="text-xs text-gray-400">Admin Login</button>
            </div>
          </div>
        </div>
      )}

      {view === 'test' && (
        <div className="flex flex-col h-screen">
          <header className="bg-white p-4 shadow flex justify-between items-center">
            <span className="font-bold truncate max-w-xs">{settings.testTitle}</span>
            <div className="font-mono text-xl text-blue-600">{Math.floor(timeLeft/60)}:{String(timeLeft%60).padStart(2,'0')}</div>
            <button onClick={handleRealSubmit} className="bg-red-600 text-white px-4 py-2 rounded font-bold">Submit</button>
          </header>
          <main className="flex-1 p-6 overflow-y-auto max-w-2xl mx-auto w-full">
            <div className="bg-white p-6 rounded-xl shadow border">
              <h2 className="text-xl mb-6">{testQuestions[currentQIndex]?.text}</h2>
              <div className="space-y-3">
                {['optionA', 'optionB', 'optionC', 'optionD'].map((opt) => (
                  <button key={opt} onClick={() => setAnswers({...answers, [testQuestions[currentQIndex].id]: opt as OptionKey})} 
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${answers[testQuestions[currentQIndex].id] === opt ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                    {testQuestions[currentQIndex][opt as OptionKey]}
                  </button>
                ))}
              </div>
              <div className="flex justify-between mt-10 pt-4 border-t">
                <button disabled={currentQIndex === 0} onClick={() => setCurrentQIndex(prev => prev - 1)} className="text-blue-600 font-bold disabled:opacity-30">Previous</button>
                <button disabled={currentQIndex === testQuestions.length - 1} onClick={() => setCurrentQIndex(prev => prev + 1)} className="text-blue-600 font-bold disabled:opacity-30">Next</button>
              </div>
            </div>
          </main>
        </div>
      )}

      {view === 'result' && (
        <div className="flex flex-col items-center justify-center h-screen text-center p-6">
          <div className="bg-white p-10 rounded-2xl shadow-xl max-w-md w-full">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">Test Finished</h1>
            <p className="text-gray-500 mb-6">Student ID: {guestId}</p>
            <div className="text-5xl font-black text-blue-600 mb-8">{currentSubmission?.score}</div>
            <button onClick={() => setView('welcome')} className="bg-gray-800 text-white px-8 py-3 rounded-xl font-bold">Return Home</button>
          </div>
        </div>
      )}

      {view === 'admin' && (
        <div className="flex flex-col md:flex-row min-h-screen">
          <nav className="bg-gray-900 text-white w-full md:w-64 p-6 flex flex-col">
            <h2 className="text-xl font-bold mb-8">Admin Panel</h2>
            <button onClick={() => setAdminTab('stats')} className={`text-left p-3 rounded mb-2 ${adminTab === 'stats' ? 'bg-blue-600' : ''}`}>Dashboard</button>
            <button onClick={() => setAdminTab('questions')} className={`text-left p-3 rounded mb-2 ${adminTab === 'questions' ? 'bg-blue-600' : ''}`}>Questions</button>
            <button onClick={() => { setIsAdmin(false); setView('welcome'); }} className="mt-auto flex items-center text-red-400 p-3"><LogOut className="mr-2 w-4 h-4"/> Logout</button>
          </nav>
          <main className="flex-1 p-8 bg-gray-100 overflow-y-auto">
            {adminTab === 'stats' && (
              <div className="bg-white p-6 rounded-xl shadow">
                <h3 className="text-lg font-bold mb-4">Test Settings</h3>
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium mb-1">Time Limit (Minutes)</label>
                    <input type="number" value={tempSettings.durationMinutes} onChange={e => setTempSettings({...tempSettings, durationMinutes: +e.target.value})} className="w-full border p-2 rounded" />
                  </div>
                  <button onClick={async () => {
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'), tempSettings);
                    showToast("Settings Saved");
                  }} className="bg-blue-600 text-white px-6 py-2 rounded font-bold">Save Settings</button>
                </div>
              </div>
            )}
            {adminTab === 'questions' && (
              <div className="bg-white p-6 rounded-xl shadow">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold">Question Bank ({questions.length})</h3>
                </div>
                <div className="divide-y max-h-[60vh] overflow-y-auto">
                  {questions.map((q, i) => (
                    <div key={q.id} className="py-3 flex justify-between items-center text-sm">
                      <span className="truncate mr-4">{i+1}. {q.text}</span>
                      <button onClick={async () => {
                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'questions', q.id));
                        showToast("Deleted");
                      }} className="text-red-500"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
