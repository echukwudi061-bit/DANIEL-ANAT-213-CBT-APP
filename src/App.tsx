import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Menu, 
  X, 
  LogOut, 
  User, 
  Shield, 
  FileText, 
  BarChart, 
  Upload, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  List,
  Edit2,
  AlertTriangle,
  Check,
  Settings as SettingsIcon,
  Lock,
  Type
} from 'lucide-react';
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  writeBatch,
  query,
  where,
  getDocs
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

// --- Helper Functions ---
const cleanText = (text: string) => text?.trim() || '';

const parseAnswerKey = (val: string): OptionKey => {
  const v = val.toLowerCase().trim();
  if (v.includes('option a') || v === 'a') return 'optionA';
  if (v.includes('option b') || v === 'b') return 'optionB';
  if (v.includes('option c') || v === 'c') return 'optionC';
  if (v.includes('option d') || v === 'd') return 'optionD';
  return 'optionA'; 
};

// --- Components ---

const Modal = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "Confirm", isDestructive = false }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
        <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button 
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg font-bold shadow-lg transition-transform active:scale-95 ${isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {confirmText}
          </button>
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
    <div className={`fixed top-4 right-4 z-[70] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-white font-medium animate-in slide-in-from-top-2 ${type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
      {type === 'success' ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
      {message}
    </div>
  );
};

// --- Main App ---

export default function DanielAnatomyCBT() {
  // Auth State
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // App State
  const [view, setView] = useState<'welcome' | 'test' | 'result' | 'admin'>('welcome');
  const [guestId, setGuestId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // UI Helpers
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Admin UI State
  const [adminTab, setAdminTab] = useState<'stats' | 'questions' | 'results'>('stats');
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [uploading, setUploading] = useState(false);
  
  // Settings State 
  const defaultSettings: TestSettings = {
    durationMinutes: 20,
    marksPerQuestion: 2,
    appName: "DANIEL'S ANATOMY CBT",
    testTitle: "ANAT 213: GENERAL EMBRYO AND GENETICS",
    adminPassword: "BrainyBlessing08148800047"
  };
  const [settings, setSettings] = useState<TestSettings>(defaultSettings);
  const [tempSettings, setTempSettings] = useState<TestSettings>(defaultSettings);

  // Data State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentSubmission, setCurrentSubmission] = useState<Submission | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [adminStats, setAdminStats] = useState({ active: 0, total: 0, completed: 0 });

  // Test Execution State
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20 * 60); 
  const [answers, setAnswers] = useState<Record<string, OptionKey>>({});
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [testQuestions, setTestQuestions] = useState<Question[]>([]); 
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Show Toast Helper ---
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
  };

  // --- Auth & Init ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        let currentGuestId = localStorage.getItem(`guestId_${appId}`);
        if (!currentGuestId) {
          currentGuestId = `GUEST-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
          localStorage.setItem(`guestId_${appId}`, currentGuestId);
        }
        setGuestId(currentGuestId);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Settings (Fixed Path & Added Auth Guard)
  useEffect(() => {
      if (!user) return; // Prevent permission-denied error by waiting for auth
      const ref = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings');
      const unsub = onSnapshot(ref, (snap) => {
          if (snap.exists()) {
              const data = snap.data() as TestSettings;
              const merged = { ...defaultSettings, ...data };
              setSettings(merged);
              setTempSettings(merged);
          } else {
              setDoc(ref, defaultSettings);
          }
      }, (error) => {
        console.log("Settings listener warning:", error.message);
      });
      return () => unsub();
  }, [user]);

  // Fetch Questions
  useEffect(() => {
    if (!user) return;
    const qRef = collection(db, 'artifacts', appId, 'public', 'data', 'questions');
    const unsubscribe = onSnapshot(qRef, (snapshot) => {
      const qs: Question[] = [];
      snapshot.forEach(doc => qs.push({ id: doc.id, ...doc.data() } as Question));
      setQuestions(qs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Session Resume Logic
  useEffect(() => {
      if (user && !loading && view === 'welcome') {
         checkForActiveSession(user.uid);
      }
  }, [user, loading, view]);

  const checkForActiveSession = async (uid: string) => {
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'submissions'),
      where('userId', '==', uid),
      where('status', '==', 'started')
    );
    try {
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data() as Submission;
        const now = Date.now();
        
        const totalSeconds = settings.durationMinutes * 60;
        const elapsed = (now - data.startTime) / 1000;
        const remaining = totalSeconds - elapsed;

        if (remaining > 0) {
            const subData = { ...data, id: docSnap.id };
            setCurrentSubmission(subData);
            setAnswers(subData.answers || {});
            setTimeLeft(remaining);
            setView('test');
        }
      }
    } catch (e) {
      console.log("Session check error", e);
    }
  };

  useEffect(() => {
    if (questions.length > 0 && currentSubmission && testQuestions.length === 0) {
      if (currentSubmission.questionOrder && currentSubmission.questionOrder.length > 0) {
        const ordered = currentSubmission.questionOrder.map(id => questions.find(q => q.id === id)).filter(Boolean) as Question[];
        setTestQuestions(ordered);
      }
    }
  }, [questions, currentSubmission, testQuestions.length]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    const subRef = collection(db, 'artifacts', appId, 'public', 'data', 'submissions');
    const unsubscribe = onSnapshot(subRef, (snapshot) => {
      const subs: Submission[] = [];
      let activeCount = 0;
      let completedCount = 0;
      snapshot.forEach(doc => {
        const data = doc.data() as Submission;
        subs.push({ ...data, id: doc.id });
        if (data.status === 'started') {
            const now = Date.now();
            if (now - data.startTime < 30 * 60 * 1000) activeCount++;
        }
        if (data.status === 'completed') completedCount++;
      });
      setAllSubmissions(subs);
      setAdminStats({ active: activeCount, total: subs.length, completed: completedCount });
    });
    return () => unsubscribe();
  }, [user, isAdmin]);

  // Timer Tick
  useEffect(() => {
    if (view === 'test' && currentSubmission?.status === 'started') {
      const timer = setInterval(() => {
        setTimeLeft((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [view, currentSubmission]);

  // Auto Submit Watcher
  useEffect(() => {
    if (timeLeft === 0 && view === 'test' && currentSubmission?.status === 'started' && !isSubmitting) {
      handleRealSubmit();
    }
  }, [timeLeft, view, currentSubmission, isSubmitting]);

  // --- Handlers ---

  const handleAdminLogin = (password: string) => {
    if (password === settings.adminPassword) {
      setIsAdmin(true);
      setView('admin');
    } else {
      showToast('Incorrect Password', 'error');
    }
  };

  const saveSettings = async () => {
      try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'settings'), tempSettings);
          showToast("Settings saved successfully!", 'success');
      } catch (e) {
          showToast("Failed to save settings.", 'error');
      }
  };

  const startTest = async () => {
    if (questions.length === 0) {
      showToast("No questions available. Ask admin.", 'error');
      return;
    }
    const shuffled = [...questions].sort(() => 0.5 - Math.random()).slice(0, 50);
    setTestQuestions(shuffled);
    
    const submissionId = `${user.uid}_${Date.now()}`;
    const newSubmission: Submission = {
      id: submissionId,
      userId: user.uid,
      guestId: guestId,
      score: 0,
      totalQuestions: shuffled.length,
      answers: {},
      status: 'started',
      startTime: Date.now(),
      questionOrder: shuffled.map(q => q.id)
    };

    try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'submissions', submissionId), newSubmission);
        setCurrentSubmission(newSubmission);
        setAnswers({});
        setTimeLeft(settings.durationMinutes * 60); 
        setCurrentQIndex(0);
        setView('test');
    } catch (e) {
        showToast("Connection failed. Try again.", 'error');
    }
  };

  const handleAnswerSelect = (questionId: string, option: OptionKey) => {
    setAnswers(prev => ({ ...prev, [questionId]: option }));
  };

  // --- Submit Logic ---
  const handleSubmitClick = () => {
      setConfirmAction({
          isOpen: true,
          title: "Submit Test?",
          message: "Are you sure you want to finish the test? You cannot change answers after submitting.",
          onConfirm: handleRealSubmit,
          isDestructive: false
      });
  };

  const handleRealSubmit = async () => {
    setConfirmAction(prev => ({...prev, isOpen: false}));
    if (!currentSubmission || isSubmitting) return;
    
    setIsSubmitting(true);
    try {
        let score = 0;
        testQuestions.forEach(q => {
          if (answers[q.id] === q.correctAnswer) {
            score += settings.marksPerQuestion; 
          }
        });

        const finishedSubmission: Submission = {
          ...currentSubmission,
          answers: answers,
          score: score,
          status: 'completed',
          endTime: Date.now()
        };

        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'submissions', currentSubmission.id), finishedSubmission);
        setCurrentSubmission(finishedSubmission);
        setView('result');
        showToast("Test Submitted Successfully!", 'success');
    } catch (error) {
        showToast("Submission failed. Check internet.", 'error');
        console.error(error);
    } finally {
        setIsSubmitting(false);
    }
  };

  // --- Admin Logic ---

  const handleDeleteAllClick = () => {
      if (questions.length === 0) {
          showToast("No questions to delete", 'error');
          return;
      }
      setConfirmAction({
          isOpen: true,
          title: "Delete ALL Questions?",
          message: "This action is permanent and cannot be undone. Are you absolutely sure?",
          onConfirm: performDeleteAll,
          isDestructive: true
      });
  };

  const performDeleteAll = async () => {
    setConfirmAction(prev => ({...prev, isOpen: false}));
    setUploading(true);
    try {
        const chunkArray = (arr: any[], size: number) => {
            const chunks = [];
            for(let i=0; i<arr.length; i+=size) chunks.push(arr.slice(i, i+size));
            return chunks;
        };

        const chunks = chunkArray(questions, 400); 
        for (const chunk of chunks) {
             const batch = writeBatch(db);
             chunk.forEach((q: Question) => {
                 const ref = doc(db, 'artifacts', appId, 'public', 'data', 'questions', q.id);
                 batch.delete(ref);
             });
             await batch.commit();
        }
        showToast("All questions deleted.", 'success');
    } catch (error) {
        console.error(error);
        showToast("Delete failed.", 'error');
    } finally {
        setUploading(false);
    }
  };

  const handleDeleteOneClick = (id: string) => {
      setConfirmAction({
          isOpen: true,
          title: "Delete Question?",
          message: "Are you sure you want to remove this question?",
          onConfirm: () => performDeleteOne(id),
          isDestructive: true
      });
  };

  const performDeleteOne = async (id: string) => {
      setConfirmAction(prev => ({...prev, isOpen: false}));
      try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'questions', id));
          showToast("Question deleted", 'success');
      } catch(e) {
          showToast("Failed to delete", 'error');
      }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingQuestion) return;
      try {
          const ref = doc(db, 'artifacts', appId, 'public', 'data', 'questions', editingQuestion.id);
          await updateDoc(ref, {
              text: editingQuestion.text,
              optionA: editingQuestion.optionA,
              optionB: editingQuestion.optionB,
              optionC: editingQuestion.optionC,
              optionD: editingQuestion.optionD,
              correctAnswer: editingQuestion.correctAnswer
          });
          setEditingQuestion(null);
          showToast('Question updated!', 'success');
      } catch (err) {
          showToast('Update failed', 'error');
      }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          const text = event.target?.result as string;
          const lines = text.split('\n');
          const newQuestions: any[] = [];
          
          for (let i = 1; i < lines.length; i++) {
              const line = lines[i];
              const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); 
              if (parts.length >= 6) {
                  const qText = cleanText(parts[0]);
                  if (qText && !qText.toLowerCase().includes('question')) { // Skip header if present
                      newQuestions.push({
                          text: qText,
                          optionA: cleanText(parts[1]),
                          optionB: cleanText(parts[2]),
                          optionC: cleanText(parts[3]),
                          optionD: cleanText(parts[4]),
                          correctAnswer: parseAnswerKey(cleanText(parts[5]))
                      });
                  }
              }
          }

          if (newQuestions.length > 0) {
              setUploading(true);
              const chunkArray = (arr: any[], size: number) => {
                   const chunks = [];
                   for(let i=0; i<arr.length; i+=size) chunks.push(arr.slice(i, i+size));
                   return chunks;
              };

              const chunks = chunkArray(newQuestions, 400);
              try {
                  for (const chunk of chunks) {
                      const batch = writeBatch(db);
                      chunk.forEach((q: any) => {
                          const newRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'questions'));
                          batch.set(newRef, q);
                      });
                      await batch.commit();
                  }
                  showToast(`Uploaded ${newQuestions.length} questions`, 'success');
              } catch (err) {
                  showToast("Batch upload failed", 'error');
              }
              setUploading(false);
          }
      };
      reader.readAsText(file);
      if(fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Views ---

  if (loading) return <div className="h-screen flex items-center justify-center text-blue-600 animate-pulse font-medium">Initializing App...</div>;

  // Max score calculation for display
  const maxScore = (currentSubmission ? currentSubmission.totalQuestions : 0) * settings.marksPerQuestion;

  return (
    <div className="font-sans text-gray-900">
        {/* Overlays */}
        {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        <Modal 
            isOpen={confirmAction.isOpen} 
            title={confirmAction.title} 
            message={confirmAction.message} 
            onConfirm={confirmAction.onConfirm} 
            onCancel={() => setConfirmAction(prev => ({...prev, isOpen: false}))}
            isDestructive={confirmAction.isDestructive}
        />

        {/* --- WELCOME VIEW --- */}
        {view === 'welcome' && (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-blue-100">
                <div className="mb-6 flex justify-center">
                <div className="bg-blue-100 p-4 rounded-full">
                    <User className="w-12 h-12 text-blue-600" />
                </div>
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2 uppercase">{settings.appName}</h1>
                <h2 className="text-lg font-medium text-blue-600 mb-6 uppercase">{settings.testTitle}</h2>
                
                <div className="space-y-4 text-left bg-gray-50 p-4 rounded-lg text-sm text-gray-700 mb-8">
                <p className="flex items-center"><Clock className="w-4 h-4 mr-2"/> <strong>Time Limit:</strong> {settings.durationMinutes} Minutes</p>
                <p className="flex items-center"><List className="w-4 h-4 mr-2"/> <strong>Questions:</strong> {questions.length > 0 ? `${questions.length} Questions Available` : 'No Questions Loaded'}</p>
                <p className="flex items-center"><CheckCircle className="w-4 h-4 mr-2"/> <strong>Scoring:</strong> {settings.marksPerQuestion} Marks per correct answer</p>
                <p className="flex items-center"><Shield className="w-4 h-4 mr-2"/> <strong>ID:</strong> {guestId}</p>
                </div>

                <button 
                type="button"
                onClick={startTest}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition transform hover:scale-105 flex items-center justify-center text-lg active:scale-95"
                >
                <Play className="w-6 h-6 mr-2" /> Start Test
                </button>

                <div className="mt-8 pt-6 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-2">Admin Access Only</p>
                    <form 
                    onSubmit={(e) => {
                        e.preventDefault();
                        const target = e.target as typeof e.target & { pass: { value: string } };
                        handleAdminLogin(target.pass.value);
                    }}
                    className="flex gap-2"
                    >
                    <input 
                        name="pass" 
                        type="password" 
                        placeholder="Admin Password" 
                        className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button type="submit" className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-900">
                        Login
                    </button>
                    </form>
                </div>
            </div>
            </div>
        )}

        {/* --- TEST VIEW --- */}
        {view === 'test' && (
             <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
                <header className="bg-white shadow-sm px-4 py-3 flex justify-between items-center z-40 sticky top-0 flex-shrink-0">
                <div className="flex items-center gap-2">
                    {/* Hamburger Menu - Visible only on mobile/tablet */}
                    <button type="button" onClick={() => setIsMenuOpen(true)} className="p-2 hover:bg-gray-100 rounded-full md:hidden">
                        <Menu className="w-6 h-6 text-gray-700" />
                    </button>

                    <div className="ml-2 overflow-hidden">
                      <h1 className="font-bold text-gray-800 text-xs md:text-lg uppercase truncate max-w-[200px] md:max-w-md" title={settings.testTitle}>
                        {settings.testTitle}
                      </h1>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <div className={`flex items-center font-mono font-bold text-lg md:text-xl mr-2 ${timeLeft < 60 ? 'text-red-600 animate-pulse' : 'text-blue-600'}`}>
                        <Clock className="w-5 h-5 mr-2" />
                        {Math.floor(timeLeft / 60)}:{Math.floor(timeLeft % 60).toString().padStart(2, '0')}
                    </div>
                    
                    <button 
                    type="button"
                    onClick={handleSubmitClick}
                    disabled={isSubmitting}
                    className="bg-red-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-sm font-bold hover:bg-red-700 shadow-sm flex items-center disabled:opacity-50 active:scale-95 transition-transform"
                    >
                    <CheckCircle className="w-4 h-4 mr-2 hidden md:block" />
                    {isSubmitting ? 'Submitting...' : 'Submit'}
                    </button>
                </div>
                </header>

                <div className="flex flex-1 overflow-hidden relative">
                    {/* Sidebar / Navigator */}
                    {/* Mobile Overlay */}
                    {isMenuOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden" onClick={() => setIsMenuOpen(false)} />}
                    
                    <aside className={`
                        fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out border-r flex flex-col
                        md:static md:translate-x-0 md:shadow-none md:z-auto
                        ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}
                    `}>
                        <div className="p-4 flex justify-between items-center border-b bg-gray-50 flex-shrink-0">
                            <span className="font-bold text-gray-700">Question Navigator</span>
                            <button type="button" onClick={() => setIsMenuOpen(false)} className="md:hidden p-1 hover:bg-gray-200 rounded-full"><X className="w-5 h-5" /></button>
                        </div>
                        
                        <div className="p-4 overflow-y-auto flex-1">
                            <div className="grid grid-cols-5 gap-2">
                                {testQuestions.map((q, idx) => {
                                    const isAnswered = !!answers[q.id];
                                    const isCurrent = idx === currentQIndex;
                                    return (
                                        <button
                                            key={q.id}
                                            type="button"
                                            onClick={() => {
                                                setCurrentQIndex(idx);
                                                setIsMenuOpen(false); // Only close on mobile
                                                if (window.innerWidth >= 768) setIsMenuOpen(true); // Keep open on desktop logic handled by css
                                            }}
                                            className={`
                                                h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all border
                                                ${isCurrent ? 'ring-2 ring-blue-600 ring-offset-1 border-blue-600 bg-white text-blue-700 z-10' : ''}
                                                ${!isCurrent && isAnswered ? 'bg-green-100 text-green-800 border-green-200' : ''}
                                                ${!isCurrent && !isAnswered ? 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100' : ''}
                                            `}
                                        >
                                            {idx + 1}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Status Tracker */}
                        <div className="p-4 border-t bg-gray-50 text-xs text-gray-600 font-medium flex-shrink-0">
                            <div className="flex justify-between items-center mb-2">
                                <span className="flex items-center"><div className="w-3 h-3 rounded-full bg-green-500 mr-2"/> Answered:</span> 
                                <span className="font-bold text-gray-900 text-sm">{Object.keys(answers).length}</span>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="flex items-center"><div className="w-3 h-3 rounded-full bg-gray-300 mr-2"/> Unanswered:</span> 
                                <span className="font-bold text-gray-900 text-sm">{testQuestions.length - Object.keys(answers).length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="flex items-center"><div className="w-3 h-3 rounded-full border-2 border-blue-600 mr-2"/> Current:</span> 
                                <span className="font-bold text-blue-700 text-sm">#{currentQIndex + 1}</span>
                            </div>
                        </div>
                    </aside>

                    {/* Main Content Area */}
                    <main className="flex-1 overflow-y-auto bg-gray-50 w-full relative">
                        <div className="p-4 md:p-8 max-w-3xl mx-auto pb-20">
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-10 min-h-[50vh]">
                                <div className="flex justify-between items-start mb-6">
                                    <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                        Question {currentQIndex + 1} of {testQuestions.length}
                                    </span>
                                </div>

                                {testQuestions[currentQIndex] ? (
                                    <>
                                        <h2 className="text-xl md:text-2xl font-medium text-gray-800 mb-8 leading-relaxed">
                                            {testQuestions[currentQIndex].text}
                                        </h2>

                                        <div className="space-y-3">
                                            {(['optionA', 'optionB', 'optionC', 'optionD'] as OptionKey[]).map((optKey) => (
                                                <button
                                                    key={optKey}
                                                    type="button"
                                                    onClick={() => handleAnswerSelect(testQuestions[currentQIndex].id, optKey)}
                                                    className={`
                                                        w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center group
                                                        ${answers[testQuestions[currentQIndex].id] === optKey 
                                                            ? 'border-blue-500 bg-blue-50 text-blue-900' 
                                                            : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                                                        }
                                                    `}
                                                >
                                                    <div className={`
                                                        w-6 h-6 rounded-full border-2 mr-4 flex items-center justify-center flex-shrink-0
                                                        ${answers[testQuestions[currentQIndex].id] === optKey ? 'border-blue-500' : 'border-gray-300 group-hover:border-blue-300'}
                                                    `}>
                                                        {answers[testQuestions[currentQIndex].id] === optKey && <div className="w-3 h-3 rounded-full bg-blue-500" />}
                                                    </div>
                                                    <span className="text-sm md:text-base">
                                                        <span className="font-bold mr-2 uppercase">{optKey.replace('option', '')}.</span>
                                                        {testQuestions[currentQIndex][optKey]}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="flex justify-between mt-10 pt-6 border-t border-gray-100">
                                            <button 
                                                type="button"
                                                disabled={currentQIndex === 0}
                                                onClick={() => setCurrentQIndex(prev => prev - 1)}
                                                className="flex items-center text-gray-600 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-gray-600 font-medium px-4 py-2 hover:bg-gray-50 rounded-lg transition"
                                            >
                                                <ChevronLeft className="w-5 h-5 mr-1" /> Previous
                                            </button>
                                            <button 
                                                type="button"
                                                disabled={currentQIndex === testQuestions.length - 1}
                                                onClick={() => setCurrentQIndex(prev => prev + 1)}
                                                className="flex items-center text-blue-600 hover:text-blue-800 disabled:opacity-30 disabled:hover:text-blue-600 font-medium px-4 py-2 hover:bg-blue-50 rounded-lg transition"
                                            >
                                                Next <ChevronRight className="w-5 h-5 ml-1" />
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="p-8 text-center text-gray-500">Loading Question...</div>
                                )}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        )}

        {/* --- RESULT VIEW --- */}
        {view === 'result' && currentSubmission && (
            <div className="min-h-screen bg-gray-50 p-4 md:p-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-6">
                    <div className="bg-white rounded-2xl shadow-lg p-8 text-center border-t-4 border-blue-500">
                        <h2 className="text-2xl font-bold text-gray-800 mb-2">Test Completed!</h2>
                        <p className="text-gray-500 mb-6">Here is how you performed on {settings.testTitle}</p>
                        
                        {/* Guest ID Display */}
                        <div className="mb-6 inline-block bg-gray-100 px-4 py-2 rounded-lg">
                            <p className="text-sm text-gray-500 uppercase tracking-wide">Student ID</p>
                            <p className="text-xl font-mono font-bold text-gray-800">{currentSubmission.guestId}</p>
                        </div>

                        <div className="flex justify-center items-center gap-8 mb-6">
                            <div className="text-center">
                                <p className="text-sm text-gray-400 uppercase tracking-wide">Score</p>
                                <p className={`text-5xl font-extrabold ${currentSubmission.score >= 70 ? 'text-green-500' : currentSubmission.score >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                                    {currentSubmission.score} <span className="text-lg text-gray-400 font-normal">/ {maxScore}</span>
                                </p>
                            </div>
                            <div className="w-px h-16 bg-gray-200"></div>
                            <div className="text-center">
                                <p className="text-sm text-gray-400 uppercase tracking-wide">Percentage</p>
                                <p className={`text-5xl font-extrabold ${currentSubmission.score >= 70 ? 'text-green-500' : currentSubmission.score >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                                    {maxScore > 0 ? Math.round((currentSubmission.score / maxScore) * 100) : 0}%
                                </p>
                            </div>
                        </div>

                        <button 
                        type="button"
                        onClick={() => {
                            setView('welcome');
                            setCurrentSubmission(null);
                        }}
                        className="bg-gray-800 text-white px-6 py-2 rounded-lg hover:bg-gray-900 transition"
                        >
                            Back to Home
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8">
                        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                            <FileText className="w-5 h-5 mr-2 text-blue-500"/> Performance Review
                        </h3>
                        
                        <div className="space-y-6">
                            {testQuestions.map((q, idx) => {
                                const userAnswerKey = currentSubmission.answers[q.id];
                                const isCorrect = userAnswerKey === q.correctAnswer;
                                
                                return (
                                    <div key={q.id} className={`p-4 rounded-xl border-l-4 ${isCorrect ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
                                        <div className="flex gap-3">
                                            <div className="mt-1 flex-shrink-0">
                                                {isCorrect ? <CheckCircle className="w-5 h-5 text-green-600"/> : <XCircle className="w-5 h-5 text-red-600"/>}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-900 mb-2"><span className="font-bold mr-1">{idx + 1}.</span> {q.text}</p>
                                                
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-3">
                                                    <div className={`${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                                                        <span className="font-bold text-xs uppercase block mb-1">Your Answer:</span>
                                                        {userAnswerKey ? (
                                                            <span><span className="uppercase font-bold">{userAnswerKey.replace('option','')}</span>: {q[userAnswerKey]}</span>
                                                        ) : (
                                                            <span className="italic">Not Answered</span>
                                                        )}
                                                    </div>
                                                    
                                                    {!isCorrect && (
                                                        <div className="text-green-700">
                                                            <span className="font-bold text-xs uppercase block mb-1">Correct Answer:</span>
                                                            <span><span className="uppercase font-bold">{q.correctAnswer.replace('option','')}</span>: {q[q.correctAnswer]}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* --- ADMIN VIEW --- */}
        {view === 'admin' && (
             <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row relative">
                {editingQuestion && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg overflow-y-auto max-h-[90vh]">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-bold">Edit Question</h3>
                                <button type="button" onClick={() => setEditingQuestion(null)}><X className="w-6 h-6 text-gray-500"/></button>
                            </div>
                            <form onSubmit={handleSaveEdit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                                    <textarea 
                                        className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" 
                                        rows={3}
                                        value={editingQuestion.text}
                                        onChange={(e) => setEditingQuestion({...editingQuestion, text: e.target.value})}
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    {(['optionA', 'optionB', 'optionC', 'optionD'] as OptionKey[]).map(key => (
                                        <div key={key}>
                                            <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">{key.replace('option', 'Option ')}</label>
                                            <input 
                                                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                                value={editingQuestion[key]}
                                                onChange={(e) => setEditingQuestion({...editingQuestion, [key]: e.target.value})}
                                                required
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Correct Answer</label>
                                    <select 
                                        className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={editingQuestion.correctAnswer}
                                        onChange={(e) => setEditingQuestion({...editingQuestion, correctAnswer: e.target.value as OptionKey})}
                                    >
                                        <option value="optionA">Option A</option>
                                        <option value="optionB">Option B</option>
                                        <option value="optionC">Option C</option>
                                        <option value="optionD">Option D</option>
                                    </select>
                                </div>
                                <div className="pt-4 flex justify-end gap-2">
                                    <button type="button" onClick={() => setEditingQuestion(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Changes</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <div className="bg-gray-900 text-white w-full md:w-64 flex-shrink-0">
                    <div className="p-6 border-b border-gray-800">
                        <h1 className="text-xl font-bold">Admin Panel</h1>
                        <p className="text-xs text-gray-400">{settings.appName}</p>
                    </div>
                    <nav className="p-4 space-y-2">
                        <button type="button" onClick={() => setAdminTab('stats')} className={`w-full text-left p-3 rounded flex items-center ${adminTab === 'stats' ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
                            <BarChart className="w-5 h-5 mr-3" /> Dashboard
                        </button>
                        <button type="button" onClick={() => setAdminTab('questions')} className={`w-full text-left p-3 rounded flex items-center ${adminTab === 'questions' ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
                            <List className="w-5 h-5 mr-3" /> Questions
                        </button>
                        <button type="button" onClick={() => setAdminTab('results')} className={`w-full text-left p-3 rounded flex items-center ${adminTab === 'results' ? 'bg-blue-600' : 'hover:bg-gray-800'}`}>
                            <FileText className="w-5 h-5 mr-3" /> Submissions
                        </button>
                        <buttontype="button" onClick={() => { setIsAdmin(false); setView('welcome'); }} className="w-full text-left p-3 rounded flex items-center text-red-400 hover:bg-gray-800 mt-10">
                            <LogOut className="w-5 h-5 mr-3" /> Logout
                        </button>
                    </nav>
                </div>

                <div className="flex-1 p-4 md:p-8 overflow-y-auto">
                    {adminTab === 'stats' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-gray-800">Overview</h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-gray-500 font-medium">Active Users (Live)</h3>
                                        <span className="relative flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                                        </span>
                                    </div>
                                    <p className="text-4xl font-bold text-gray-800">{adminStats.active}</p>
                                    <p className="text-xs text-gray-400 mt-2">Started test in last 30 mins</p>
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-gray-500 font-medium">Total Participants</h3>
                                        <span className="p-2 bg-blue-100 text-blue-600 rounded-full"><User className="w-5 h-5"/></span>
                                    </div>
                                    <p className="text-4xl font-bold text-gray-800">{adminStats.total}</p>
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-gray-500 font-medium">Completed Tests</h3>
                                        <span className="p-2 bg-purple-100 text-purple-600 rounded-full"><CheckCircle className="w-5 h-5"/></span>
                                    </div>
                                    <p className="text-4xl font-bold text-gray-800">{adminStats.completed}</p>
                                </div>
                            </div>
                            
                            {/* Test Configuration */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-6">
                                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                                    <SettingsIcon className="w-5 h-5 mr-2 text-gray-500" /> Test Configuration
                                </h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                    {/* App Name */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                                           <Type className="w-4 h-4 mr-1 text-gray-400" /> App Name
                                        </label>
                                        <input 
                                            type="text" 
                                            value={tempSettings.appName} 
                                            onChange={(e) => setTempSettings({...tempSettings, appName: e.target.value})}
                                            className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="e.g. My Anatomy CBT"
                                        />
                                    </div>

                                    {/* Test Title */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                                            <FileText className="w-4 h-4 mr-1 text-gray-400" /> Test Title
                                        </label>
                                        <input 
                                            type="text" 
                                            value={tempSettings.testTitle} 
                                            onChange={(e) => setTempSettings({...tempSettings, testTitle: e.target.value})}
                                            className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="e.g. ANAT 101: Introduction"
                                        />
                                    </div>

                                    {/* Duration */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                                            <Clock className="w-4 h-4 mr-1 text-gray-400" /> Test Duration (Minutes)
                                        </label>
                                        <input 
                                            type="number" 
                                            value={tempSettings.durationMinutes} 
                             </label>
                                        <input 
                                            type="number" 
                                            value={tempSettings.durationMinutes} 
                                            onChange={(e) => setTempSettings({...tempSettings, durationMinutes: parseInt(e.target.value) || 0})}
                                            className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>

                                    {/* Marks */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                                            <CheckCircle className="w-4 h-4 mr-1 text-gray-400" /> Marks per Question
                                        </label>
                                        <input 
                                            type="number" 
                                            value={tempSettings.marksPerQuestion} 
                                            onChange={(e) => setTempSettings({...tempSettings, marksPerQuestion: parseInt(e.target.value) || 0})}
                                            className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    
                                    {/* Admin Password */}
                                    <div className="md:col-span-2">
                                         <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                                            <Lock className="w-4 h-4 mr-1 text-gray-400" /> Admin Password
                                        </label>
                                        <input 
                                            type="text" 
                                            value={tempSettings.adminPassword} 
                                            onChange={(e) => setTempSettings({...tempSettings, adminPassword: e.target.value})}
                                            className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-yellow-50 border-yellow-200"
                                            placeholder="Change admin password"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Make sure to remember this password if you change it.</p>
                                    </div>
                                </div>

                                <div className="mt-4 flex justify-end">
                                    <button 
                                        type="button" 
                                        onClick={saveSettings} 
                                        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
                                    >
                                        Save Configuration
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {adminTab === 'questions' && (
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <h2 className="text-2xl font-bold text-gray-800">Question Bank ({questions.length})</h2>
                                <div className="flex gap-2 flex-wrap">
                                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm active:scale-95 transition">
                                        <Upload className="w-4 h-4 mr-2" /> {uploading ? 'Importing...' : 'Import CSV'}
                                    </button>
                                    <input type="file" ref={fileInputRef} onChange={handleCSVUpload} accept=".csv" className="hidden" />
                                    <button type="button" onClick={handleDeleteAllClick} disabled={uploading} className="flex items-center px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 text-sm active:scale-95 transition">
                                        <Trash2 className="w-4 h-4 mr-2" /> Clear All
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap md:whitespace-normal">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="p-4 font-medium text-gray-500 w-12">#</th>
                                            <th className="p-4 font-medium text-gray-500 min-w-[200px]">Question</th>
                                            <th className="p-4 font-medium text-gray-500">Correct Answer</th>
                                            <th className="p-4 font-medium text-gray-500 w-32">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {questions.map((q, idx) => (
                                            <tr key={q.id} className="hover:bg-gray-50">
                                                <td className="p-4 text-gray-400">{idx + 1}</td>
                                                <td className="p-4 max-w-xs md:max-w-lg truncate md:whitespace-normal">{q.text}</td>
                                                <td className="p-4"><span className="uppercase bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-bold">{q.correctAnswer.replace('option','')}</span></td>
                                                <td className="p-4">
                                                    <div className="flex gap-2">
                                                        <button type="button" onClick={() => setEditingQuestion(q)} className="text-blue-500 hover:text-blue-700 p-2 hover:bg-blue-50 rounded transition-colors"><Edit2 className="w-4 h-4" />
                                                        </button>
                                                        <button type="button" onClick={() => handleDeleteOneClick(q.id)} className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded transition-colors">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {questions.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="p-8 text-center text-gray-400">
                                                    No questions found. Please upload a CSV file.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {adminTab === 'results' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold text-gray-800">Submission Logs</h2>
                            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="p-4 font-medium text-gray-500">Guest ID</th>
                                            <th className="p-4 font-medium text-gray-500">Status</th>
                                            <th className="p-4 font-medium text-gray-500">Score</th>
                                            <th className="p-4 font-medium text-gray-500">Percentage</th>
                                            <th className="p-4 font-medium text-gray-500">Time Submitted</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {allSubmissions.sort((a,b) => (b.endTime || 0) - (a.endTime || 0)).map((sub) => {
                                            const subMaxScore = sub.totalQuestions * settings.marksPerQuestion;
                                            const pct = subMaxScore > 0 ? Math.round((sub.score / subMaxScore) * 100) : 0;
                                            return (
                                                <tr key={sub.id} className="hover:bg-gray-50">
                                                    <td className="p-4 font-mono text-blue-600">{sub.guestId}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${sub.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                            {sub.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 font-bold">{sub.score} / {subMaxScore}</td>
                                                    <td className="p-4">{pct}%</td>
                                                    <td className="p-4 text-gray-500">
                                                        {sub.endTime ? new Date(sub.endTime).toLocaleString() : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
  );
}


