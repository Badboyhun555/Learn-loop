/* =====================================================
   LEARNLOOP — SCRIPT.JS (Supabase Backend)
   Custom Auth: users table + SHA-256 + Salt
===================================================== */

/* =====================================================
   BLOCK 0 — CORE HELPERS (AUTH + UTILITIES)
===================================================== */

/* ---- SHA-256 Hashing (Web Crypto API) ---- */
async function sha256(message) {

    if (!window.crypto || !crypto.subtle) {
        alert("SHA-256 ke liye localhost ya HTTPS zaroori hai. VS Code Live Server use karo.");
        throw new Error("crypto.subtle not available");
    }

    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---- Random Salt Generator ---- */
function generateSalt() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---- Session (localStorage) ---- */
function setCurrentUser(user) {
    localStorage.setItem("learnLoopUser", JSON.stringify(user));
}

function getCurrentUser() {
    const user = localStorage.getItem("learnLoopUser");
    return user ? JSON.parse(user) : null;
}

function logout() {
    localStorage.removeItem("learnLoopUser");
    window.location.href = "index.html";
}

/* ---- Auth Guard: protected pages ---- */
function requireAuth() {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = "index.html";
        return null;
    }
    return user;
}

/* ---- Profile Initial (navbar circle) ---- */
function setProfileInitial(user) {
    const circle = document.querySelector(".profile-circle");
    if (circle && user && user.name) {
        circle.innerText = user.name.charAt(0).toUpperCase();
    }
}

/* ---- Streak Badge ---- */
function setStreakBadge(streak) {
    const badge = document.getElementById("streakBadge");
    if (badge) badge.innerText = "🔥 " + streak + " Day Streak";
}

/* ---- Ensure progress row exists ---- */
async function ensureUserProgress(userId) {
    const { data } = await supabase
        .from("user_progress")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (!data) {
        await supabase.from("user_progress").insert({ user_id: userId });
    }
}

/* ---- Daily Streak Logic ---- */
async function updateStreak(userId) {

    await ensureUserProgress(userId);

    const { data } = await supabase
        .from("user_progress")
        .select("streak_count, last_active_date")
        .eq("user_id", userId)
        .single();

    const today = new Date().toISOString().slice(0, 10);

    if (data.last_active_date === today) {
        return data.streak_count;
    }

    const yesterday =
        new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    let newStreak;
    if (data.last_active_date === yesterday) {
        newStreak = data.streak_count + 1;
    } else {
        newStreak = 1;
    }

    await supabase
        .from("user_progress")
        .update({
            streak_count: newStreak,
            last_active_date: today,
            updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);

    return newStreak;
}

/* ---- Activity Logger ---- */
async function logActivity(userId, type, description) {
    await supabase.from("activity_log").insert({
        user_id: userId,
        activity_type: type,
        description: description
    });
}

/* ---- Subject Progress Calculator (real data) ---- */
async function getSubjectsWithProgress(userId) {

    const { data: subjects } = await supabase
        .from("subjects").select("*").order("sort_order");

    const { data: topics } = await supabase
        .from("topics").select("id, subject_id");

    const { data: completed } = await supabase
        .from("topic_progress")
        .select("topic_id")
        .eq("user_id", userId)
        .eq("completed", true);

    const completedIds = new Set((completed || []).map(c => c.topic_id));

    return (subjects || []).map(s => {
        const subjectTopics = (topics || []).filter(t => t.subject_id === s.id);
        const done = subjectTopics.filter(t => completedIds.has(t.id)).length;
        const percent = subjectTopics.length
            ? Math.round((done / subjectTopics.length) * 100) : 0;
        return { ...s, totalTopics: subjectTopics.length, doneTopics: done, percent };
    });
}

/* =====================================================
   BLOCK 1 — AUTH (index.html)
===================================================== */

/*function openLogin() {
    document.getElementById("loginOverlay").style.display = "flex";
}

function closeLogin() {
    document.getElementById("loginOverlay").style.display = "none";
}

function toggleAuthForm() {
    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const title = document.getElementById("authTitle");
    const toggleText = document.getElementById("authToggleText");

    if (loginForm.style.display === "none") {
        loginForm.style.display = "block";
        signupForm.style.display = "none";
        title.innerText = "Welcome to LearnLoop";
        toggleText.innerHTML =
            'New to LearnLoop? <strong onclick="toggleAuthForm()" style="cursor:pointer;">Sign up</strong>';
    } else {
        loginForm.style.display = "none";
        signupForm.style.display = "block";
        title.innerText = "Create your account";
        toggleText.innerHTML =
            'Already have an account? <strong onclick="toggleAuthForm()" style="cursor:pointer;">Login</strong>';
    }
}
*/
/* Open popup — 'login' ya 'signup' tab ke saath */
function openLogin(type) {
    document.getElementById("loginOverlay").style.display = "flex";
    showAuthForm(type === "signup" ? "signup" : "login");
}

function closeLogin() {
    document.getElementById("loginOverlay").style.display = "none";
}

/* Login <-> Signup tab switch */
function showAuthForm(type) {

    const loginForm = document.getElementById("loginForm");
    const signupForm = document.getElementById("signupForm");
    const tabLogin = document.getElementById("tabLogin");
    const tabSignup = document.getElementById("tabSignup");
    const title = document.getElementById("authTitle");

    if (type === "signup") {

        loginForm.style.display = "none";
        signupForm.style.display = "block";

        tabLogin.classList.remove("active");
        tabSignup.classList.add("active");

        title.innerText = "Create your account";

    } else {

        loginForm.style.display = "block";
        signupForm.style.display = "none";

        tabLogin.classList.add("active");
        tabSignup.classList.remove("active");

        title.innerText = "Welcome to LearnLoop";
    }
}
/* ---- SIGNUP ---- */
async function handleSignup(event) {

    event.preventDefault();

    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim().toLowerCase();
    const password = document.getElementById("signupPassword").value;

    if (password.length < 6) {
        alert("Password must be at least 6 characters.");
        return;
    }

    const { data: existing } = await supabase
        .from("users").select("id").eq("email", email).maybeSingle();

    if (existing) {
        alert("This email is already registered. Please login.");
        return;
    }

    const salt = generateSalt();
    const passwordHash = await sha256(password + salt);

    const { data, error } = await supabase
        .from("users")
        .insert({ name: name, email: email, password_hash: passwordHash, salt: salt })
        .select()
        .single();

    if (error) {
        alert("Signup failed: " + error.message);
        return;
    }

    setCurrentUser({ id: data.id, email: data.email, name: data.name });
    alert("Account created! Welcome to LearnLoop 🚀");
    window.location.href = "onboarding.html";
}

/* ---- LOGIN ---- */
async function handleLogin(event) {

    event.preventDefault();

    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const password = document.getElementById("loginPassword").value;

    const { data: user } = await supabase
        .from("users").select("*").eq("email", email).maybeSingle();

    if (!user) {
        alert("No account found with this email.");
        return;
    }

    const passwordHash = await sha256(password + user.salt);

    if (passwordHash !== user.password_hash) {
        alert("Incorrect password. Please try again.");
        return;
    }

    setCurrentUser({ id: user.id, email: user.email, name: user.name });
    alert("Login successful! Welcome back 🚀");

    const { data: profile } = await supabase
        .from("user_profiles").select("user_id")
        .eq("user_id", user.id).maybeSingle();

    window.location.href = profile ? "dashboard.html" : "onboarding.html";
}

/* =====================================================
   BLOCK 2 — ONBOARDING
===================================================== */

function selectSubject(button) {
    button.classList.toggle("selected");
}

function selectTime(button) {
    document.querySelectorAll(".time-btn").forEach(b => b.classList.remove("selected"));
    button.classList.add("selected");
}

async function saveOnboarding() {

    const user = requireAuth();
    if (!user) return;

    const year = document.getElementById("year").value;
    const branch = document.getElementById("branch").value;
    const goal = document.getElementById("goal").value;
    const selectedSubjects = document.querySelectorAll(".selection-btn.selected");
    const selectedTime = document.querySelector(".time-btn.selected");

    if (!year || !branch || !goal || selectedSubjects.length === 0 || !selectedTime) {
        alert("Please complete all sections before continuing.");
        return;
    }

    let subjects = [];
    selectedSubjects.forEach(b => subjects.push(b.innerText.trim()));

    const { error } = await supabase
        .from("user_profiles")
        .upsert({
            user_id: user.id,
            year: parseInt(year),
            branch: branch,
            subjects: subjects,
            study_time: selectedTime.innerText.trim(),
            goal: goal,
            updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });

    if (error) {
        alert("Could not save your data: " + error.message);
        return;
    }

    await logActivity(user.id, "onboarding", "Completed profile setup");
    alert("Great! Your learning journey is personalized 🎯");
    window.location.href = "dashboard.html";
}

/* =====================================================
   BLOCK 3 — DASHBOARD
===================================================== */

function goToLearn() { window.location.href = "learn.html"; }
function startChallenge() { window.location.href = "challenge.html"; }
function askAI() { window.location.href = "ai.html"; }
function examMode() { window.location.href = "exam.html"; }

async function initDashboardPage() {

    const user = requireAuth();
    if (!user) return;

    setProfileInitial(user);

    try {
        const streak = await updateStreak(user.id);
        document.getElementById("streakCount").innerText = streak;

        await ensureUserProgress(user.id);

        const { data: progress } = await supabase
            .from("user_progress").select("*")
            .eq("user_id", user.id).single();

        document.getElementById("studentName").innerText =
            user.name ? user.name.split(" ")[0] : "Student";

        document.getElementById("statLessons").innerText =
            progress ? progress.study_minutes : 0; // placeholder, replaced below

        /* ---- Stats ---- */
        const subjects = await getSubjectsWithProgress(user.id);
        const lessonsDone = subjects.reduce((sum, s) => sum + s.doneTopics, 0);

        document.getElementById("statLessons").innerText = lessonsDone;
        document.getElementById("statAccuracy").innerText =
            (progress ? progress.quiz_accuracy : 0) + "%";

        const mins = progress ? progress.study_minutes : 0;
        document.getElementById("statStudyTime").innerText =
            mins >= 60 ? (mins / 60).toFixed(1) + " hrs" : mins + " min";

        /* ---- Subject progress rows ---- */
        const container = document.getElementById("subjectProgress");
        container.innerHTML = subjects.map(s => `
            <div class="subject-row">
                <div><strong>${s.name.replace("Engineering ", "")}</strong></div>
                <span>${s.percent}%</span>
            </div>
            <div class="mini-progress">
                <div class="mini-progress-fill" style="width:${s.percent}%;"></div>
            </div>`).join("");

        /* ---- Continue Learning card (last completed topic) ---- */
        const { data: lastTopic } = await supabase
            .from("topic_progress")
            .select("completed_at, topics(title, subjects(id, name, icon))")
            .eq("user_id", user.id)
            .order("completed_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        let clSubject, clTopic, clPercent;

        if (lastTopic && lastTopic.topics) {
            clSubject = lastTopic.topics.subjects.name;
            clTopic = lastTopic.topics.title;
            const match = subjects.find(
                s => s.id === lastTopic.topics.subjects.id
            );
            clPercent = match ? match.percent : 0;
        } else if (subjects.length > 0) {
            clSubject = subjects[0].name;
            clTopic = "Start your first topic!";
            clPercent = subjects[0].percent;
        }

        document.getElementById("clSubject").innerText = clSubject;
        document.getElementById("clTopic").innerText = clTopic;
        document.getElementById("clFill").style.width = clPercent + "%";
        document.getElementById("clPercent").innerText = clPercent + "% completed";

    } catch (err) {
        console.error("Dashboard load error:", err);
    }
}

/* =====================================================
   BLOCK 4 — LEARN PAGE
===================================================== */

let currentTopics = [];
let currentSubjects = [];

async function initLearnPage() {

    const user = requireAuth();
    if (!user) return;

    setProfileInitial(user);

    try {
        updateStreak(user.id).then(setStreakBadge).catch(console.error);

        currentSubjects = await getSubjectsWithProgress(user.id);

        const grid = document.getElementById("subjectGrid");
        grid.innerHTML = currentSubjects.map(renderSubjectCard).join("");

        if (currentSubjects.length > 0) {
            await showTopics(currentSubjects[0].id);
        }
    } catch (err) {
        console.error("Learn page load error:", err);
    }
}

function renderSubjectCard(s) {
    return `
    <div class="subject-card">
        <div class="subject-icon">${s.icon}</div>
        <h3>${s.name}</h3>
        <p>${s.totalTopics} Topics • ${s.percent}% Completed</p>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${s.percent}%;"></div>
        </div>
        <button class="learn-btn" onclick="showTopics('${s.id}')">
            Explore Subject →
        </button>
    </div>`;
}

async function showTopics(subjectId) {

    const subject = currentSubjects.find(s => s.id === subjectId);
    if (!subject) return;

    document.getElementById("topicTitle").innerText = subject.name;
    document.getElementById("topicCount").innerText = subject.totalTopics + " Topics";

    const { data: topics } = await supabase
        .from("topics").select("*")
        .eq("subject_id", subjectId)
        .order("order_number");

    currentTopics = topics || [];

    document.getElementById("topicGrid").innerHTML =
        currentTopics.map((t, i) => renderTopicCard(t, i)).join("");

    document.getElementById("topicsSection").scrollIntoView({ behavior: "smooth" });
}

function renderTopicCard(t, index) {
    const num = String(index + 1).padStart(2, "0");
    const done = s_isCompleted(t.id);
    return `
    <div class="topic-card">
        <div class="topic-number">${num}</div>
        <div class="topic-content">
            <h3>${t.title} ${done ? '<span style="color:#16a34a;">✅</span>' : ""}</h3>
            <p>${t.description || ""}</p>
            <div class="topic-actions">
                <button onclick="openLearning('${t.id}')">📖 Learn</button>
                <button onclick="openNotes('${t.id}')">📝 Notes</button>
            </div>
        </div>
    </div>`;
}

/* completed topic ids cache */
let completedTopicIds = new Set();

function s_isCompleted(topicId) {
    return completedTopicIds.has(topicId);
}

async function loadCompletedTopics(userId) {
    const { data } = await supabase
        .from("topic_progress").select("topic_id")
        .eq("user_id", userId).eq("completed", true);
    completedTopicIds = new Set((data || []).map(d => d.topic_id));
}

async function openLearning(topicId) {

    const topic = currentTopics.find(t => t.id === topicId);
    if (!topic) return;

    document.getElementById("popupIcon").innerText = "📖";
    document.getElementById("popupTitle").innerText = "Learning: " + topic.title;
    document.getElementById("popupMessage").innerText =
        "Your lesson content for " + topic.title +
        " will appear here. This lesson has been marked as completed in your progress ✅";

    document.getElementById("learnPopup").style.display = "flex";

    await markTopicComplete(topic);
}

async function markTopicComplete(topic) {

    const user = getCurrentUser();
    if (!user) return;

    const { data: existing } = await supabase
        .from("topic_progress").select("id")
        .eq("user_id", user.id)
        .eq("topic_id", topic.id)
        .maybeSingle();

    if (existing) return;

    await supabase.from("topic_progress").insert({
        user_id: user.id,
        topic_id: topic.id,
        completed: true,
        completed_at: new Date().toISOString()
    });

    const { data: p } = await supabase
        .from("user_progress").select("study_minutes")
        .eq("user_id", user.id).single();

    await supabase.from("user_progress")
        .update({ study_minutes: ((p && p.study_minutes) || 0) + 20 })
        .eq("user_id", user.id);

    await logActivity(user.id, "lesson", "Completed " + topic.title + " lesson");
}

function openNotes(topicId) {
    const topic = currentTopics.find(t => t.id === topicId);
    const title = topic ? topic.title : "this topic";

    document.getElementById("popupIcon").innerText = "📝";
    document.getElementById("popupTitle").innerText = "Handwritten Notes";
    document.getElementById("popupMessage").innerText =
        "Handwritten notes for " + title +
        " will be available here after verified SKIT study material is added.";

    document.getElementById("learnPopup").style.display = "flex";
}

function openNotesGeneral() {
    document.getElementById("popupIcon").innerText = "📝";
    document.getElementById("popupTitle").innerText = "Handwritten Notes";
    document.getElementById("popupMessage").innerText =
        "Handwritten notes for your subjects will be available here after verified SKIT study material is added.";
    document.getElementById("learnPopup").style.display = "flex";
}

function showResourceMessage() {
    document.getElementById("popupIcon").innerText = "🎥";
    document.getElementById("popupTitle").innerText = "Learning Resources";
    document.getElementById("popupMessage").innerText =
        "Useful videos and external learning resources will be added here.";
    document.getElementById("learnPopup").style.display = "flex";
}

function goToPractice() {
    alert("Practice section will be connected to the Question Bank soon! 🧠");
}

function closeLearnPopup() {
    document.getElementById("learnPopup").style.display = "none";
}

/* =====================================================
   BLOCK 5 — AI STUDY ASSISTANT
===================================================== */

function quickQuestion(question) {
    document.getElementById("aiQuestion").value = question;
}

async function askLearnLoopAI() {

    const question = document.getElementById("aiQuestion").value.trim();
    const subject = document.getElementById("aiSubject").value;

    if (subject === "") {
        alert("Please select a subject first.");
        return;
    }
    if (question === "") {
        alert("Please enter your question.");
        return;
    }

    let answer = "";
    const q = question.toLowerCase();

    if (q.includes("matrix")) {
        answer = "A matrix is a rectangular arrangement of numbers, symbols or expressions organised into rows and columns. For example, a 2 × 2 matrix has 2 rows and 2 columns. Matrices are widely used in engineering, computer science and data processing.";
    } else if (q.includes("eigenvalue")) {
        answer = "An eigenvalue is a special value associated with a square matrix. It tells us how much a particular eigenvector is stretched or compressed when the matrix transformation is applied.";
    } else if (q.includes("variable")) {
        answer = "A variable in C is a named memory location used to store a value. For example, int age = 18; creates a variable called age that stores the integer value 18.";
    } else if (q.includes("newton")) {
        answer = "Newton's Second Law states that the force acting on an object is equal to its mass multiplied by its acceleration: F = ma. In simple words, greater force produces greater acceleration when mass remains constant.";
    } else {
        answer = "Great question! For the prototype, LearnLoop AI can provide explanations for selected common topics. In the final version, the AI assistant will be connected to a real AI service and will use your learning context to provide personalised explanations.";
    }

    document.getElementById("responseText").innerText = answer;
    document.getElementById("aiResponse").style.display = "block";

    /* Save to Supabase */
    const user = getCurrentUser();
    if (user) {
        try {
            await supabase.from("ai_questions").insert({
                user_id: user.id,
                subject: subject,
                question: question,
                answer: answer
            });
            await logActivity(user.id, "ai", "Asked LearnLoop AI • " + question.slice(0, 60));
        } catch (err) {
            console.error("AI save error:", err);
        }
    }
}

function explainSimply() {
    document.getElementById("responseText").innerText =
        "In very simple words: the concept becomes easier when we break it into small parts. LearnLoop AI can explain the topic step-by-step instead of giving you a complicated textbook definition.";
}

function giveExample() {
    document.getElementById("responseText").innerText =
        "Example: Think of the concept as something you encounter in real life. Connecting a difficult theory with a simple real-world example makes it easier to remember and understand.";
}

function givePractice() {
    document.getElementById("responseText").innerText =
        "🧠 Practice Question: Explain the concept you just learned in your own words and give one example. Try solving it without looking at your notes!";
}

/* =====================================================
   BLOCK 6 — DAILY CHALLENGE
===================================================== */

const challengeQuestions = [
    {
        subject: "Mathematics",
        question: "What is the order of a matrix having 3 rows and 2 columns?",
        options: ["2 × 3", "3 × 2", "3 × 3", "2 × 2"],
        answer: 1
    },
    {
        subject: "Programming",
        question: "Which symbol is used to end a statement in C?",
        options: [":", ".", ";", ","],
        answer: 2
    },
    {
        subject: "Physics",
        question: "What is the SI unit of force?",
        options: ["Joule", "Newton", "Watt", "Pascal"],
        answer: 1
    },
    {
        subject: "Mathematics",
        question: "Which of the following is a scalar quantity?",
        options: ["Velocity", "Force", "Acceleration", "Temperature"],
        answer: 3
    },
    {
        subject: "Programming",
        question: "Which data type is commonly used to store an integer in C?",
        options: ["float", "char", "int", "double"],
        answer: 2
    }
];

let currentQuestion = 0;
let score = 0;
let selectedAnswer = null;
let quizFinished = false;
let timeLeft = 300;
let timerInterval;

function startQuiz() {
    currentQuestion = 0;
    score = 0;
    selectedAnswer = null;
    quizFinished = false;
    timeLeft = 300;

    document.getElementById("quizCard").style.display = "block";
    document.getElementById("resultCard").style.display = "none";

    loadQuestion();
    startTimer();
}

function loadQuestion() {

    const question = challengeQuestions[currentQuestion];

    document.getElementById("questionNumber").innerText =
        "Question " + (currentQuestion + 1) + " of " + challengeQuestions.length;
    document.getElementById("questionSubject").innerText = question.subject;
    document.getElementById("questionText").innerText = question.question;

    const optionsContainer = document.getElementById("optionsContainer");
    optionsContainer.innerHTML = "";

    question.options.forEach(function(option, index) {
        const button = document.createElement("button");
        button.className = "option-btn";
        button.innerText = String.fromCharCode(65 + index) + ". " + option;
        button.onclick = function() { selectAnswer(index, button); };
        optionsContainer.appendChild(button);
    });

    document.getElementById("answerFeedback").innerText = "";
    document.getElementById("answerFeedback").style.color = "";
    selectedAnswer = null;

    const progress = ((currentQuestion + 1) / challengeQuestions.length) * 100;
    document.getElementById("quizProgress").style.width = progress + "%";
}

function selectAnswer(index, button) {

    if (selectedAnswer !== null) return;

    selectedAnswer = index;

    const question = challengeQuestions[currentQuestion];
    const allOptions = document.querySelectorAll(".option-btn");

    allOptions.forEach(o => o.disabled = true);

    if (index === question.answer) {
        button.classList.add("correct");
        score++;
        document.getElementById("answerFeedback").innerText = "✅ Correct! Great job!";
        document.getElementById("answerFeedback").style.color = "#16a34a";
    } else {
        button.classList.add("wrong");
        allOptions[question.answer].classList.add("correct");
        document.getElementById("answerFeedback").innerText =
            "❌ Not quite. The correct answer is " + question.options[question.answer] + ".";
        document.getElementById("answerFeedback").style.color = "#dc2626";
    }
}

function nextQuestion() {

    if (selectedAnswer === null) {
        alert("Please select an answer first.");
        return;
    }

    if (currentQuestion < challengeQuestions.length - 1) {
        currentQuestion++;
        loadQuestion();
    } else {
        finishQuiz();
    }
}

async function finishQuiz() {

    clearInterval(timerInterval);
    quizFinished = true;

    document.getElementById("quizCard").style.display = "none";
    document.getElementById("resultCard").style.display = "block";

    const total = challengeQuestions.length;
    const wrong = total - score;
    const accuracy = Math.round((score / total) * 100);

    document.getElementById("finalScore").innerText = score + "/" + total;
    document.getElementById("correctAnswers").innerText = score;
    document.getElementById("wrongAnswers").innerText = wrong;
    document.getElementById("accuracy").innerText = accuracy + "%";

    if (accuracy === 100) {
        document.getElementById("resultMessage").innerText =
            "Perfect score! You're on fire! 🔥";
    } else if (accuracy >= 60) {
        document.getElementById("resultMessage").innerText =
            "Great work! Keep practicing to improve further. 💪";
    } else {
        document.getElementById("resultMessage").innerText =
            "Good attempt! Review the topics and try again. 📚";
    }

    /* ---- Save result to Supabase ---- */
    const user = getCurrentUser();
    if (!user) return;

    try {
        await supabase.from("challenge_results").insert({
            user_id: user.id,
            score: score,
            total_questions: total,
            accuracy: accuracy
        });

        const { data: attempts } = await supabase
            .from("challenge_results").select("accuracy")
            .eq("user_id", user.id);

        if (attempts && attempts.length > 0) {
            const avg = Math.round(
                attempts.reduce((s, a) => s + a.accuracy, 0) / attempts.length
            );
            await supabase.from("user_progress")
                .update({ quiz_accuracy: avg })
                .eq("user_id", user.id);
        }

        const { data: p } = await supabase
            .from("user_progress").select("study_minutes")
            .eq("user_id", user.id).single();

        await supabase.from("user_progress")
            .update({ study_minutes: ((p && p.study_minutes) || 0) + 5 })
            .eq("user_id", user.id);

        await logActivity(user.id, "challenge",
            "Completed Daily Challenge • " + score + "/" + total + " correct");

        const { data: up } = await supabase
            .from("user_progress").select("streak_count")
            .eq("user_id", user.id).single();

        document.getElementById("streakSuccessText").innerText =
            "🔥 " + ((up && up.streak_count) || 1) + "-Day Streak Maintained!";
    } catch (err) {
        console.error("Result save error:", err);
    }
}

function startTimer() {

    clearInterval(timerInterval);

    timerInterval = setInterval(function() {

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            finishQuiz();
            return;
        }

        timeLeft--;

        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;

        document.getElementById("timer").innerText =
            "⏱️ " + String(minutes).padStart(2, "0") + ":" +
            String(seconds).padStart(2, "0");

    }, 1000);
}

function restartQuiz() {
    startQuiz();
}

/* =====================================================
   BLOCK 7 — EXAM MODE
===================================================== */

function selectExamSubject(button, subject) {
    document.querySelectorAll(".exam-subject").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    console.log("Selected subject:", subject);
}

function showRevision(type) {

    const overlay = document.getElementById("revisionOverlay");
    const title = document.getElementById("revisionTitle");
    const text = document.getElementById("revisionText");

    if (type === "formulas") {
        title.innerText = "📐 Important Formulas";
        text.innerText = "Formula revision content will appear here. For example: Matrix operations, determinants, eigenvalue formulas and other important formulas.";
    } else if (type === "concepts") {
        title.innerText = "💡 Key Concepts";
        text.innerText = "Important concepts for quick revision will appear here with short and simple explanations.";
    } else if (type === "mistakes") {
        title.innerText = "⚠️ Common Mistakes";
        text.innerText = "Common mistakes made by students will appear here so you can avoid them during the exam.";
    }

    overlay.style.display = "flex";
}

function closeRevision() {
    document.getElementById("revisionOverlay").style.display = "none";
}

function startExamPractice() {
    window.location.href = "challenge.html";
}

function initExamPage() {
    const user = requireAuth();
    if (!user) return;
    setProfileInitial(user);
    updateStreak(user.id).then(setStreakBadge).catch(console.error);
}

/* =====================================================
   BLOCK 8 — PROGRESS PAGE
===================================================== */

function ordinalYear(y) {
    return ["First Year", "Second Year", "Third Year", "Fourth Year"][y - 1] || (y + " Year");
}

function setAchievement(id, unlocked) {
    const card = document.getElementById(id);
    if (!card) return;
    card.classList.remove("unlocked", "locked");
    card.classList.add(unlocked ? "unlocked" : "locked");
    card.querySelector(".achievement-icon").innerText =
        unlocked ? card.dataset.icon : "🔒";
    card.querySelector(".achievement-status").innerText =
        unlocked ? "Unlocked" : "Locked";
}

async function initProgressPage() {

    const user = requireAuth();
    if (!user) return;

    setProfileInitial(user);

    try {
        const streak = await updateStreak(user.id);
        setStreakBadge(streak);

        const subjects = await getSubjectsWithProgress(user.id);
        const overall = subjects.length
            ? Math.round(subjects.reduce((s, x) => s + x.percent, 0) / subjects.length)
            : 0;

        document.getElementById("overallPercent").innerText = overall + "%";

        const { data: progress } = await supabase
            .from("user_progress").select("*")
            .eq("user_id", user.id).single();

        const lessonsDone = subjects.reduce((sum, s) => sum + s.doneTopics, 0);

        document.getElementById("prLessons").innerText = lessonsDone;
        document.getElementById("prAccuracy").innerText =
            ((progress && progress.quiz_accuracy) || 0) + "%";

        const mins = (progress && progress.study_minutes) || 0;
        document.getElementById("prStudyTime").innerText =
            mins >= 60 ? (mins / 60).toFixed(1) + " hrs" : mins + " min";

        /* Subject-wise progress */
        document.getElementById("subjectProgressList").innerHTML = subjects.map(s => `
            <div class="subject-progress-card">
                <div class="subject-progress-info">
                    <strong>${s.icon} ${s.name}</strong>
                    <span>${s.percent}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-bar-fill" style="width: ${s.percent}%;"></div>
                </div>
            </div>`).join("");

        /* Achievements */
        setAchievement("achStreak7", streak >= 7);
        setAchievement("achQuiz", ((progress && progress.quiz_accuracy) || 0) >= 80);
        setAchievement("achLessons10", lessonsDone >= 10);
        setAchievement("achLegend", streak >= 30);

        /* Profile */
        const { data: profile } = await supabase
            .from("user_profiles").select("*")
            .eq("user_id", user.id).maybeSingle();

        const branchNames = { cse: "CSE", iot: "CSE-IoT", ece: "ECE", me: "Mechanical" };
        const goalNames = {
            concepts: "Improve Concepts", exams: "Prepare for Exams",
            practice: "Practice More", grades: "Improve Grades"
        };

        const branchText = profile ? (branchNames[profile.branch] || profile.branch) : "—";
        const yearText = profile ? ordinalYear(profile.year) : "—";
        const goalText = profile ? (goalNames[profile.goal] || profile.goal) : "—";

        document.getElementById("profileSummaryLine").innerText =
            "B.Tech • " + branchText + " • " + yearText;
        document.getElementById("profileGoal").innerText = "🎯 Goal: " + goalText;

        document.getElementById("pName").innerText = "Name: " + (user.name || "Student");
        document.getElementById("pBranch").innerText = "Branch: " + branchText;
        document.getElementById("pYear").innerText = "Year: " + yearText;
        document.getElementById("pGoal").innerText = "Goal: " + goalText;

        /* Recent Activity */
        const { data: activities } = await supabase
            .from("activity_log").select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(5);

        const iconMap = { lesson: "✅", challenge: "🧠", ai: "🤖", onboarding: "🚀", exam: "📝" };
        const list = document.getElementById("activityList");

        if (!activities || activities.length === 0) {
            list.innerHTML =
                '<div class="activity-item"><span class="activity-icon">🌱</span><div><strong>No activity yet</strong><small>Start learning to see your activity here</small></div></div>';
        } else {
            list.innerHTML = activities.map(a => `
                <div class="activity-item">
                    <span class="activity-icon">${iconMap[a.activity_type] || "•"}</span>
                    <div>
                        <strong>${a.description || a.activity_type}</strong>
                        <small>${new Date(a.created_at).toLocaleString()}</small>
                    </div>
                </div>`).join("");
        }
    } catch (err) {
        console.error("Progress load error:", err);
    }
}

/* =====================================================
   BLOCK 9 — PROFILE POPUP
===================================================== */

function showProfileMessage() {
    document.getElementById("profileOverlay").style.display = "flex";
}

function closeProfileMessage() {
    document.getElementById("profileOverlay").style.display = "none";
}

/* =====================================================
   PAGE ROUTER — har page pe correct init
===================================================== */

document.addEventListener("DOMContentLoaded", function() {

    const page = document.body.id;

    if (page === "page-index") {
        if (getCurrentUser()) window.location.href = "dashboard.html";
    }
    else if (page === "page-onboarding") {
        const user = requireAuth();
        if (user) setProfileInitial(user);
    }
    else if (page === "page-dashboard") { initDashboardPage(); }
    else if (page === "page-learn") {
        requireAuth() && getCurrentUser() && loadCompletedTopics(getCurrentUser().id)
            .then(() => initLearnPage());
    }
    else if (page === "page-ai") {
        const user = requireAuth();
        if (user) setProfileInitial(user);
    }
    else if (page === "page-challenge") {
        const user = requireAuth();
        if (!user) return;
        setProfileInitial(user);
        updateStreak(user.id)
            .then(setStreakBadge)
            .catch(console.error)
            .finally(() => startQuiz());
    }
    else if (page === "page-progress") { initProgressPage(); }
    else if (page === "page-exam") { initExamPage(); }
});
