import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ChevronLeft, 
  ChevronRight, 
  RotateCcw,
  FileText,
  Menu,
  X as XIcon, 
  LayoutGrid,
  Home,
  Tag,
  Check,
  X, 
  Minus,
  ClipboardList,
  Trophy   
} from 'lucide-react';

// --- HELPER: FISHER-YATES SHUFFLE ---
const shuffleArray = (array) => {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
};

// --- COMPONENT: GUEST ID BADGE ---
const GuestIdBadge = ({ id, className = "" }) => (
  <div className={`bg-blue-50 text-blue-800 border border-blue-100 rounded-full px-2 py-1 text-[10px] font-bold tracking-wide whitespace-nowrap ${className}`}>
    {id}
  </div>
);

export default function App() {
  // --- 1. CONFIGURATION STATE ---
  const [appName] = useState(() => localStorage.getItem('cbt_appName') || "DANIEL'S ANATOMY CBT APP");
  const [testTitle] = useState(() => localStorage.getItem('cbt_testTitle') || "ANAT 213: GENERAL EMBRYO AND GENETICS");
  const [testDuration] = useState(() => {
    const saved = localStorage.getItem('cbt_duration');
    return saved ? parseInt(saved, 10) : 20;
  });
  const [marksPerQuestion] = useState(() => {
    const saved = localStorage.getItem('cbt_marks');
    return saved ? parseInt(saved, 10) : 2;
  });

  // --- 2. QUESTIONS STATE ---
  const [questions, setQuestions] = useState(() => {
    const saved = localStorage.getItem('cbt_questions');
    return saved ? JSON.parse(saved) : [];
  });

  // --- 3. VIEW STATE (LAZY INIT - INSTANT RESUME) ---
  const [view, setView] = useState(() => {
    // A. Check if a test is currently running (Valid End Time)
    const savedEndTime = localStorage.getItem('cbt_endTime');
    if (savedEndTime && parseInt(savedEndTime, 10) > Date.now()) {
      return 'test';
    }
    // B. Check if a result is waiting in session (Survives Refresh)
    const savedResult = sessionStorage.getItem('cbt_currentResult');
    if (savedResult) {
      return 'result';
    }
    // C. Default
    return 'welcome';
  });

  // --- 4. TEST TAKING STATE ---
  const [guestId] = useState(() => {
    const saved = localStorage.getItem('cbt_guestId');
    if (saved) return saved;
    const newId = `GUEST ID: ${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem('cbt_guestId', newId);
    return newId;
  });

  const [currentQIndex, setCurrentQIndex] = useState(() => {
    const saved = localStorage.getItem('cbt_currentIndex');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [answers, setAnswers] = useState(() => {
    const saved = localStorage.getItem('cbt_answers');
    return saved ? JSON.parse(saved) : {};
  });

  // LAZY TIMER INIT
  const [timeLeft, setTimeLeft] = useState(() => {
    const savedEndTime = localStorage.getItem('cbt_endTime');
    if (savedEndTime) {
      const diff = Math.ceil((parseInt(savedEndTime, 10) - Date.now()) / 1000);
      return diff > 0 ? diff : 0;
    }
    return 0;
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- EFFECT: LOAD QUESTIONS FROM CSV ON MOUNT ---
  useEffect(() => {
    // We REMOVED the "if (questions.length === 0)" check.
    // This now runs every time the page loads (refresh).
    
    fetch('/Questions.csv')
        .then(res => res.ok ? res.text() : Promise.reject("CSV not found"))
        .then(text => {
            const lines = text.split('\n');
            const newQuestions = [];
            lines.forEach((line, idx) => {
               const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
               if (parts.length >= 6 && idx > 0) {
                  const clean = (str) => str?.replace(/^"|"$/g, '').trim() || '';
                  let correctKey = clean(parts[5]).toLowerCase();
                  
                  if (['a','b','c','d'].includes(correctKey) || correctKey.includes('option')) {
                      if(correctKey.includes('a')) correctKey = 'optionA';
                      else if(correctKey.includes('b')) correctKey = 'optionB';
                      else if(correctKey.includes('c')) correctKey = 'optionC';
                      else if(correctKey.includes('d')) correctKey = 'optionD';
                  } else { correctKey = 'optionA'; }

                  if (clean(parts[0])) {
                     newQuestions.push({
                         // CHANGED: Use 'idx' instead of Date.now(). 
                         // This keeps the ID stable so refreshing doesn't delete your answers.
                         id: `q-${idx}`, 
                         text: clean(parts[0]),
                         optionA: clean(parts[1]),
                         optionB: clean(parts[2]),
                         optionC: clean(parts[3]),
                         optionD: clean(parts[4]),
                         correctAnswer: correctKey
                     });
                  }
               }
            });

            if (newQuestions.length > 0) {
                // IMPORTANT: If a test is running, we only update the CONTENT, we do NOT re-shuffle.
                // Re-shuffling mid-test would make Question 5 suddenly become Question 20.
                const isTestRunning = view === 'test';
                
                if (isTestRunning) {
                     // 1. Create a map of the NEW content for quick lookup
                     const newContentMap = new Map(newQuestions.map(q => [q.id, q]));
                     
                     // 2. Update the EXISTING questions array with new text/options
                     // This preserves the current shuffled order but updates typos/text.
                     const updatedCurrentQuestions = questions.map(q => {
                         const update = newContentMap.get(q.id);
                         return update ? { ...q, ...update } : q;
                     });

                     // 3. If new questions were ADDED to the file, append them at the end
                     // (We filter out IDs that already exist in the current shuffled list)
                     const existingIds = new Set(updatedCurrentQuestions.map(q => q.id));
                     const brandNewQuestions = newQuestions.filter(q => !existingIds.has(q.id));
                     
                     const finalList = [...updatedCurrentQuestions, ...brandNewQuestions];
                     
                     setQuestions(finalList);
                     localStorage.setItem('cbt_questions', JSON.stringify(finalList));
                } else {
                    // If NO test is running, simple: Load everything and shuffle fresh.
                    const shuffled = shuffleArray(newQuestions);
                    setQuestions(shuffled);
                    localStorage.setItem('cbt_questions', JSON.stringify(shuffled));
                }
            }
        })
        .catch(err => console.log("Auto-load info:", err));
  }, []); // Run once on mount
  
  // --- EFFECT: PERSIST CURRENT QUESTION INDEX ---
  useEffect(() => {
    if (view === 'test') {
      localStorage.setItem('cbt_currentIndex', currentQIndex.toString());
    }
  }, [currentQIndex, view]);

  // --- LOGIC: TIMER & END TIME CALCULATION ---
  useEffect(() => {
    let interval;
    if (view === 'test') {
      const savedEndTime = localStorage.getItem('cbt_endTime');
      
      const updateTimer = () => {
        if (!savedEndTime) return;
        const end = parseInt(savedEndTime, 10);
        const now = Date.now();
        const diff = Math.ceil((end - now) / 1000);
        
        if (diff <= 0) {
          setTimeLeft(0);
          handleSubmit(); 
        } else {
          setTimeLeft(diff);
        }
      };

      updateTimer(); 
      interval = setInterval(updateTimer, 1000);
    }
    return () => clearInterval(interval);
  }, [view]);

  // --- HANDLERS ---

  const startTest = () => {
    if (questions.length === 0) {
      alert("Loading questions... Please wait or refresh if stuck.");
      return;
    }
    const randomized = shuffleArray([...questions]);
    setQuestions(randomized);
    localStorage.setItem('cbt_questions', JSON.stringify(randomized));

    const endTime = Date.now() + (testDuration * 60 * 1000);
    localStorage.setItem('cbt_endTime', endTime.toString());
    localStorage.setItem('cbt_answers', JSON.stringify({}));
    localStorage.setItem('cbt_currentIndex', '0');
    
    sessionStorage.removeItem('cbt_currentResult');
    
    setAnswers({});
    setCurrentQIndex(0);
    setView('test');
    setIsMobileMenuOpen(false);
  };

  const handleAnswerSelect = (qId, option) => {
    const newAnswers = { ...answers, [qId]: option };
    setAnswers(newAnswers);
    localStorage.setItem('cbt_answers', JSON.stringify(newAnswers));
  };

  const handleSubmit = () => {
    // 1. Calculate Score
    let rawScore = 0;
    questions.forEach(q => {
      if (answers[q.id] === q.correctAnswer) rawScore += 1;
    });
    const finalScore = rawScore * marksPerQuestion;
    const totalPossible = questions.length * marksPerQuestion;
    const percentage = totalPossible > 0 ? Math.round((finalScore / totalPossible) * 100) : 0;

    // 2. Calculate Additional Analytics
    const attemptedCount = Object.keys(answers).length;
    
    // Time Taken Calculation
    const savedEndTime = localStorage.getItem('cbt_endTime');
    const endTimeInt = savedEndTime ? parseInt(savedEndTime, 10) : Date.now();
    const durationMs = testDuration * 60 * 1000;
    const startTime = endTimeInt - durationMs; 
    let timeTakenMs = Date.now() - startTime;
    if (timeTakenMs > durationMs) timeTakenMs = durationMs; // Cap at max duration
    
    const resultData = {
      score: finalScore,
      total: totalPossible,
      percentage: percentage,
      questions: questions,
      answers: answers,
      completedAt: Date.now(),
      analytics: {
        timeTakenMs,
        attemptedCount
      }
    };
    
    sessionStorage.setItem('cbt_currentResult', JSON.stringify(resultData));

    localStorage.removeItem('cbt_endTime');
    localStorage.removeItem('cbt_answers');
    localStorage.removeItem('cbt_currentIndex');
    
    setView('result');
  };

  // --- SIMPLE EXIT LOGIC (Removes history trap complexity) ---
  const handleExitToWelcome = () => {
    localStorage.removeItem('cbt_endTime');
    localStorage.removeItem('cbt_answers');
    localStorage.removeItem('cbt_currentIndex');
    sessionStorage.removeItem('cbt_currentResult');
    
    setView('welcome');
  };

  // --- DIRECT EXIT (For UI Buttons) ---
  const handleDirectExit = () => {
    handleExitToWelcome();
  };

  const formatTime = (seconds) => {
    if (seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  // ---------------- RENDER: WELCOME ----------------
  if (view === 'welcome') {
    return (
      /* 1. CONTAINER: 'fixed inset-0' locks screen (stops jumping). 'overflow-hidden' clips edges. */
      <div className="fixed inset-0 bg-gray-50 flex items-center justify-center p-4 font-sans text-gray-900 overflow-hidden">
        
        {/* 2. CARD: 'p-5 md:p-10' means small padding on mobile, big on laptop. 
             'shrink-0' ensures it holds its shape. */ }
        <div className="bg-white p-5 md:p-10 rounded-2xl shadow-xl max-w-3xl w-full text-center border border-blue-100 relative flex flex-col justify-center shrink-0 max-h-full overflow-y-auto">
          
          <div className="absolute top-4 right-4">
             <GuestIdBadge id={guestId} />
          </div>

          <div className="mb-4 md:mb-6 flex flex-col items-center justify-center gap-3">
            <div className="bg-blue-100 p-3 md:p-4 rounded-full">
              <FileText className="w-8 h-8 md:w-12 md:h-12 text-blue-600" />
            </div>
          </div>
          
          <h1 className="text-xl md:text-3xl font-bold text-gray-900 mb-1 uppercase tracking-tight">{appName}</h1>
          
          {/* RESPONSIVE MARGIN: mb-4 (mobile) vs mb-8 (laptop) */}
          <p className="text-sm md:text-lg font-extrabold mb-4 md:mb-8 uppercase tracking-wide text-blue-700">
            {testTitle}
          </p>
          
          <div className="text-left bg-gray-50 p-4 rounded-lg text-sm text-gray-700 mb-4 md:mb-8 space-y-2">
            <p className="flex items-center"><Clock className="w-4 h-4 mr-2"/> <strong>Time Limit:</strong> {testDuration} Minutes</p>
            <p className="flex items-center"><FileText className="w-4 h-4 mr-2"/> <strong>Questions:</strong> {questions.length}</p>
            <p className="flex items-center"><Tag className="w-4 h-4 mr-2"/> <strong>Scoring:</strong> {marksPerQuestion} Marks / Question</p>
          </div>

          <button 
            onClick={startTest}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 md:py-4 rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center mb-4 md:mb-6 flex-shrink-0"
          >
             <Play className="w-5 h-5 mr-2" /> Start Test
          </button>

          {/* --- WELCOME FOOTER --- */}
          <div className="mt-2 md:mt-8 pt-4 md:pt-6 border-t border-gray-100 flex flex-col items-center gap-1 md:gap-2">
            <p className="text-[9px] md:text-xs font-bold tracking-widest text-gray-400 uppercase text-center">
              THE APP IS PROVIDED BY ©️ {new Date().getFullYear()} DANIEL'S DIGITAL SERVICES. ALL RIGHTS RESERVED.
            </p>
            <p className="text-[9px] md:text-xs font-medium text-center">
               <span className="uppercase font-extrabold text-gray-400 mr-1">TECHNICAL SUPPORT:</span>
               <a href="mailto:danielsdigitalservices1@gmail.com" className="text-blue-600 hover:underline transition-all lowercase">
                 danielsdigitalservices1@gmail.com
               </a>
            </p>
          </div>

        </div>
      </div>
    );
            }

  // ---------------- RENDER: TEST ----------------
  if (view === 'test') {
    const question = questions[currentQIndex];
    if(!question) return null;

    const answeredCount = Object.keys(answers).length;
    const totalCount = questions.length;

    return (
      <div className="h-[100dvh] bg-gray-50 flex flex-col font-sans overflow-hidden">
        
        {/* STICKY HEADER FOR TEST */}
        <header className="flex-shrink-0 z-50 bg-white/90 backdrop-blur-md shadow-sm px-3 md:px-6 py-3 flex justify-between items-center w-full relative transition-all">
          <div className="flex items-center gap-2 overflow-hidden mr-2">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-1 hover:bg-gray-100 rounded-lg flex-shrink-0"
            >
              <Menu className="w-6 h-6 text-gray-600"/>
            </button>

            <div className="flex flex-col overflow-hidden min-w-0 items-start">
               {/* UPDATED: App Name size matched to Test Title */}
               <span className="text-xs md:text-lg font-bold text-gray-900 uppercase truncate">{appName}</span>
               <h1 className="font-bold text-blue-600 text-xs md:text-lg uppercase truncate leading-tight mb-1">{testTitle}</h1>
               <GuestIdBadge id={guestId} />
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
            <div className={`font-mono font-bold text-sm md:text-xl ${timeLeft < 60 ? 'text-red-600 animate-pulse' : 'text-blue-600'} flex items-center`}>
              <Clock className="w-4 h-4 md:w-5 md:h-5 mr-1 md:mr-2" />
              {formatTime(timeLeft)}
            </div>
            
            <button 
              onClick={() => { if(window.confirm("Are you sure you want to submit?")) handleSubmit(); }}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-bold shadow-md transition text-xs md:text-base whitespace-nowrap flex items-center"
            >
              <CheckCircle className="w-4 h-4 mr-1.5" /> 
              Submit
            </button>
            
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative">
             {isMobileMenuOpen && (
              <div 
                className="absolute inset-0 bg-black bg-opacity-50 z-30 md:hidden"
                onClick={() => setIsMobileMenuOpen(false)}
              />
            )}

            <aside className={`
                /* --- CONTAINER --- */
                /* h-screen + overflow-hidden = The Sidebar text/buttons scroll, but the Sidebar ITSELF never moves */
                fixed inset-y-0 left-0 z-50 w-64 flex flex-col overflow-hidden
                bg-white border-r border-gray-200 shadow-xl
                transform transition-transform duration-300 ease-in-out
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}

                /* Desktop positioning */
                md:relative md:translate-x-0 md:shadow-none md:z-10 md:w-72 md:h-full
            `}>
                {/* --- 1. HEADER (Locked in place) --- */}
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center flex-shrink-0 z-20">
                    <h2 className="font-bold text-gray-700 flex items-center text-sm md:text-base">
                        <LayoutGrid className="w-4 h-4 md:w-5 md:h-5 mr-2 text-blue-600"/> Navigator
                     </h2>
                    <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-1 text-gray-500">
                      <XIcon className="w-5 h-5"/>
                    </button>
                </div>
                
                {/* --- 2. QUESTIONS (Scrolls internally) --- */}
                {/* overflow-y-auto: The scrollbar appears HERE, not on the whole page */ }
                {/* min-h-0: Allows it to shrink so footer stays visible */ }
                <div className="overflow-y-auto overscroll-y-contain p-4 min-h-0 bg-white">
                   <div className="grid grid-cols-5 gap-2">
                        {questions.map((q, idx) => {
                            const isAnswered = !!answers[q.id];
                            const isCurrent = idx === currentQIndex;
                            return (
                                <button
                                    key={q.id}
                                    onClick={() => { setCurrentQIndex(idx); setIsMobileMenuOpen(false); }}
                                    className={`
                                        h-8 w-8 md:h-10 md:w-10 rounded-lg text-xs md:text-sm font-bold transition flex items-center justify-center border
                                        ${isCurrent ? 'ring-2 ring-blue-600 ring-offset-1 border-blue-600 z-10' : ''}
                                        ${isAnswered ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}
                                    `}
                                >
                                    {idx + 1}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* --- 3. FOOTER (Locked or Hugging) --- */}
                {/* flex-shrink-0: Forces it to stay on screen, no matter how long the list is */ }
                <div className="p-4 pb-8 md:pb-4 border-t border-gray-200 bg-gray-50 text-xs font-medium space-y-2 flex-shrink-0 z-20 bg-white">
                    <div className="flex justify-between items-center">
                        <span className="flex items-center text-gray-600"><div className="w-2 h-2 md:w-3 md:h-3 bg-green-500 rounded-full mr-2"/> Answered</span>
                        <span className="font-bold">{answeredCount}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="flex items-center text-gray-600"><div className="w-2 h-2 md:w-3 md:h-3 bg-gray-300 rounded-full mr-2"/> Unanswered</span>
                        <span className="font-bold">{totalCount - answeredCount}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                         <span className="flex items-center text-gray-600">
                             <div className="w-2 h-2 md:w-3 md:h-3 rounded-full border-2 border-blue-600 mr-2" />
                             Current
                         </span>
                         <span className="font-bold">#{currentQIndex + 1}</span>
                    </div>
                </div>
            </aside>
          
          <main className="flex-1 overflow-y-auto bg-gray-50 p-3 md:p-8 w-full">
                {/* OPTIMIZATION: max-w-5xl for Test Screen */}
                <div className="max-w-5xl mx-auto w-full">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-10 min-h-[50vh]">
                        <div className="mb-4 md:mb-6 flex justify-between items-center">
                            <span className="bg-blue-100 text-blue-800 border border-blue-200 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider">
                                Question {currentQIndex + 1} of {questions.length}
                            </span>
                            <span className="bg-blue-100 text-blue-800 border border-blue-200 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider">
                                 {answeredCount}/{totalCount} Done
                            </span>
                        </div>

                        <h2 className="text-lg md:text-2xl font-medium text-gray-800 mb-6 md:mb-8 leading-relaxed break-words whitespace-pre-wrap">
                            {question.text}
                        </h2>

                        <div className="space-y-3">
                           {['optionA', 'optionB', 'optionC', 'optionD'].map((optKey) => (
                              <button
                                    key={optKey}
                                    onClick={() => handleAnswerSelect(question.id, optKey)}
                                    className={`
                                        w-full text-left p-3 md:p-4 rounded-xl border-2 transition-all duration-200 flex items-start md:items-center group
                                                                ${answers[question.id] === optKey 
                                            ? 'border-blue-500 bg-blue-50 text-blue-900' 
                                            : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                                        }
                                      `}
                                >
                                    <div className={`
                                        w-5 h-5 md:w-6 md:h-6 rounded-full border-2 mr-3 md:mr-4 flex items-center justify-center flex-shrink-0 mt-0.5 md:mt-0
                                        ${answers[question.id] === optKey ? 'border-blue-500' : 'border-gray-300'}
                                    `}>        
                                        {answers[question.id] === optKey && <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-blue-500" />}
                                     </div>
                                    <span className="text-sm md:text-base text-gray-700 font-medium break-words">
                                        <span className="font-bold mr-2 uppercase text-xs md:text-sm">{optKey.replace('option', '')}.</span>
                                        {question[optKey]}
                                    </span>
                                 </button>
                            ))}
                        </div>

                        <div className="flex justify-between mt-8 md:mt-10 pt-6 border-t border-gray-100">
                            <button 
                                disabled={currentQIndex === 0}
                                onClick={() => setCurrentQIndex(prev => prev - 1)}
                                className="flex items-center text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-gray-500 font-medium text-sm md:text-base"
                            >
                                <ChevronLeft className="w-4 h-4 md:w-5 md:h-5 mr-1" /> Previous
                            </button>
                              
                            <button 
                                 disabled={currentQIndex === questions.length - 1}
                                 onClick={() => setCurrentQIndex(prev => prev + 1)}
                                 className="flex items-center text-blue-600 hover:text-blue-800 disabled:opacity-30 disabled:hover:text-blue-600 font-medium text-sm md:text-base"
                              >
                                    Next <ChevronRight className="w-4 h-4 md:w-5 md:h-5 ml-1" />
                             </button>
                        </div>
                    </div>
                </div>
            </main>
      </div>
      </div>
    );
  }

    // ---------------- RENDER: RESULT ----------------
  if (view === 'result') {
    const resultDataStr = sessionStorage.getItem('cbt_currentResult');
    if (!resultDataStr) {
      setView('welcome');
      return null;
    }
    const resultData = JSON.parse(resultDataStr);

    // --- DETERMINE TIER AND STYLING ---
    const pct = resultData.percentage;
    let statusTier, statusColor, statusBg, statusBorder, StatusIcon, statusMsg, scoreColor;

    if (pct < 40) {
      statusTier = 'FAIL';
      statusColor = 'text-red-600';
      statusBg = 'bg-red-50';
      statusBorder = 'border-red-200';
      StatusIcon = XCircle;
      statusMsg = "Don't give up! Review your mistakes and try again.";
      scoreColor = 'text-red-600';
    } else if (pct < 70) {
      statusTier = 'PASS';
      statusColor = 'text-green-600';
      statusBg = 'bg-green-50';
      statusBorder = 'border-green-200';
      StatusIcon = CheckCircle;
      statusMsg = "Good job! You have a solid understanding of this topic.";
      scoreColor = 'text-green-600';
    } else {
      statusTier = 'DISTINCTION';
      statusColor = 'text-yellow-500';
      statusBg = 'bg-yellow-50';
      statusBorder = 'border-yellow-200';
      StatusIcon = Trophy;
      statusMsg = "Outstanding! You have mastered this Course.";
      scoreColor = 'text-yellow-500';
    }

    const totalQuestions = resultData.questions.length;
    const correctCount = resultData.questions.filter(q => resultData.answers[q.id] === q.correctAnswer).length;
    const analytics = resultData.analytics || {};
    const attemptedCount = analytics.attemptedCount ?? Object.keys(resultData.answers).length;
    const wrongCount = attemptedCount - correctCount;
    const skippedCount = totalQuestions - attemptedCount;
    const timeTakenMs = analytics.timeTakenMs || 0;
    
    const completedAt = resultData.completedAt || Date.now();
    const dateObj = new Date(completedAt);
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    const dateStr = `${day}-${month}-${year}`;
    const timeStr = dateObj.toLocaleTimeString([], { hour12: false });
    const timestampStr = `TEST COMPLETED ON: ${dateStr} • ${timeStr}`;

    return (
      /* CHANGE 1: LOCKED CONTAINER (fixed inset-0) */
      <div className="fixed inset-0 bg-gray-50 flex flex-col font-sans text-gray-900 overflow-hidden">
        
        {/* CHANGE 2: HEADER IS NOT STICKY (flex-shrink-0) */}
        <div className="flex-shrink-0 z-50 bg-white/90 backdrop-blur-md shadow-sm border-b border-gray-100 px-4 py-3 flex items-center justify-between">
           
           <div className="w-12 flex-shrink-0 flex justify-start">
             <button 
               onClick={handleDirectExit}
               className="p-2 -ml-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
             >
               <Home size={20} strokeWidth={1.5} className="text-gray-700" />
             </button>
           </div>

           <div className="flex-1 text-center min-w-0 max-w-2xl mx-auto px-1">
               <h3 className="text-xs md:text-sm font-bold text-gray-900 uppercase tracking-tight leading-tight truncate">
                 {appName}
               </h3>
               <div className="text-xs md:text-sm font-bold text-blue-600 uppercase tracking-tight leading-tight truncate block">
                 {testTitle}
               </div>
           </div>

           <div className="w-24 flex-shrink-0 flex justify-end">
              <GuestIdBadge id={guestId} />
           </div>
        </div>

        {/* CHANGE 3: SCROLLABLE WRAPPER (flex-1 overflow-y-auto) */}
        <div className="flex-1 overflow-y-auto w-full">
            <div className="max-w-5xl mx-auto p-4 space-y-6 pb-24"> 
              
              {/* 1. MAIN SCORE CARD */}
              <div className="bg-white p-8 rounded-2xl shadow-xl text-center relative overflow-hidden">
                <div className="mb-4 flex justify-center">
                    <StatusIcon className={`w-16 h-16 ${statusColor}`} />
                </div>
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2">FINAL SCORE</h2>
                <div className={`text-5xl font-black mb-6 ${scoreColor}`}>
                    {resultData.score} <span className={`text-2xl font-bold ${scoreColor}`}>/ {resultData.total}</span>
                </div>
                <div className="flex flex-col items-center justify-center gap-2 mb-8">
                    <div className={`${statusBg} ${statusBorder} border px-6 py-2 rounded-full`}>
                        <span className={`text-lg font-bold tracking-widest ${statusColor}`}>
                            {statusTier}
                        </span>
                    </div>
                    <p className={`text-sm font-medium ${statusColor} max-w-xs mx-auto leading-tight`}>
                        {statusMsg}
                    </p>
                </div>
                <div className="border-t border-gray-100 pt-4 mt-4">
                     <p className="text-[9px] font-bold tracking-widest text-gray-500 uppercase text-center">
                       {timestampStr}
                     </p>
                </div>
              </div>

              {/* 2. ANALYTICS GRID */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider ml-1">Test Analytics</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-green-50 p-3 rounded-xl border border-green-100 flex flex-col items-center justify-center shadow-sm">
                        <Check className="w-5 h-5 text-green-600 mb-1" />
                        <span className="text-[10px] uppercase font-bold text-gray-400 text-center leading-tight">Correct</span>
                        <span className="text-lg font-bold text-gray-900 mt-1">{correctCount}</span>
                    </div>
                    <div className="bg-red-50 p-3 rounded-xl border border-red-100 flex flex-col items-center justify-center shadow-sm">
                        <X className="w-5 h-5 text-red-600 mb-1" />
                        <span className="text-[10px] uppercase font-bold text-gray-400 text-center leading-tight">Wrong</span>
                        <span className="text-lg font-bold text-gray-900 mt-1">{wrongCount}</span>
                    </div>
                    <div className="bg-orange-50 p-3 rounded-xl border border-orange-100 flex flex-col items-center justify-center shadow-sm">
                        <Minus className="w-5 h-5 text-orange-500 mb-1" />
                        <span className="text-[10px] uppercase font-bold text-gray-400 text-center leading-tight">Skipped</span>
                        <span className="text-lg font-bold text-gray-900 mt-1">{skippedCount}</span>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex flex-col items-center justify-center shadow-sm">
                        <Play className="w-5 h-5 text-blue-600 mb-1" />
                        <span className="text-[10px] uppercase font-bold text-gray-400 text-center leading-tight">Attempted</span>
                        <span className="text-lg font-bold text-gray-900 mt-1">{attemptedCount}</span>
                    </div>
                    <div className="bg-gray-100 p-3 rounded-xl border border-gray-200 flex flex-col items-center justify-center shadow-sm">
                        <ClipboardList className="w-5 h-5 text-gray-600 mb-1" />
                        <span className="text-[10px] uppercase font-bold text-gray-400 text-center leading-tight">Total Questions</span>
                        <span className="text-lg font-bold text-gray-900 mt-1">{totalQuestions}</span>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-xl border border-purple-100 flex flex-col items-center justify-center shadow-sm">
                        <Clock className="w-5 h-5 text-purple-600 mb-1" />
                        <span className="text-[10px] uppercase font-bold text-gray-400 text-center leading-tight">Time Taken</span>
                        <span className="text-lg font-bold text-gray-900 mt-1">{formatDuration(timeTakenMs)}</span>
                    </div>
                </div>
              </div>

              {/* 3. DETAILED TEST REVIEW */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                 <div className="p-4 bg-gray-50 border-b border-gray-200 font-bold text-gray-900">
                    Detailed Test Review
                 </div>
                 <div className="divide-y divide-gray-100">
                    {resultData.questions.map((q, idx) => {
                        const userAns = resultData.answers[q.id];
                        const isCorrect = userAns === q.correctAnswer;
                        const skipped = !userAns;
                        return (
                            <div key={q.id} className="p-4 md:p-6">
                                <div className="flex gap-3">
                                    <span className="font-bold text-gray-900 text-sm md:text-base">{idx + 1}.</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-gray-900 mb-3 text-sm md:text-base break-words">{q.text}</p>
                                        <div className="flex flex-col gap-2 text-xs md:text-sm">
                                            <div className={`flex items-start p-2 rounded ${isCorrect ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                                                <span className="font-bold w-20 md:w-24 flex-shrink-0 uppercase text-[10px] md:text-xs mt-0.5">Your Answer:</span>
                                                <span className="break-words">
                                                    {skipped ? <span className="italic text-gray-500">Skipped</span> : 
                                                        <span><span className="font-bold uppercase mr-1">{userAns.replace('option','')}</span> {q[userAns]}</span>
                                                    }
                                                    {isCorrect && <CheckCircle className="inline w-3 h-3 md:w-4 md:h-4 ml-2"/>}
                                                    {!isCorrect && !skipped && <XCircle className="inline w-3 h-3 md:w-4 md:h-4 ml-2"/>}
                                                </span>
                                            </div>

                                            {!isCorrect && (
                                                <div className="flex items-start p-2 rounded bg-green-50 text-green-800">
                                                    <span className="font-bold w-20 md:w-24 flex-shrink-0 uppercase text-[10px] md:text-xs mt-0.5">Correct Answer:</span>
                                                    <span className="break-words">
                                                        <span className="font-bold uppercase mr-1">{q.correctAnswer.replace('option','')}</span>
                                                        {q[q.correctAnswer]}
                                                    </span>
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
              
              {/* 4. BACK TO HOME BUTTON */}
              <div className="mt-12 pb-10">
                 <button 
                    onClick={handleDirectExit}
                    className="bg-gray-900 hover:bg-black text-white px-6 py-4 rounded-xl font-bold transition flex items-center justify-center w-full shadow-lg"
                 >
                    <RotateCcw className="w-5 h-5 mr-2" /> Back to Home
                 </button>
                 
                 {/* --- RESULT FOOTER --- */}
                 <div className="mt-12 pt-6 border-t border-gray-200 text-center">
                     <p className="text-[9px] md:text-[10px] font-bold tracking-widest text-gray-400 uppercase mb-2">
                        THE APP IS PROVIDED BY ©️ {new Date().getFullYear()} DANIEL'S DIGITAL SERVICES. ALL RIGHTS RESERVED.
                     </p>
                     <p className="text-[10px] md:text-xs text-gray-500 font-medium">
                        Need help or noticed an issue? Email us at <a href="mailto:danielsdigitalservices1@gmail.com" className="text-blue-600 font-bold hover:underline">danielsdigitalservices1@gmail.com</a>.
                     </p>
                 </div>
              </div>
            </div> {/* END max-w-5xl */}
        </div> {/* END flex-1 overflow-y-auto */}
      </div> /* END fixed inset-0 */
    );
            }
  
  return null;
}
  
