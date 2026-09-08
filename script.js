/* =====================================================
   LEARNLOOP — SCRIPT.JS
   Supabase Backend
   Custom Auth: users table + SHA-256
   No Salt
===================================================== */


/* =====================================================
   BLOCK 0 — CORE HELPERS
   AUTH + UTILITIES
===================================================== */


/* -----------------------------------------------------
   SHA-256 Hashing — Web Crypto API
----------------------------------------------------- */

async function sha256(message) {

    if (!window.crypto || !crypto.subtle) {
        alert(
            "SHA-256 ke liye localhost ya HTTPS zaroori hai. " +
            "VS Code Live Server use karo."
        );

        throw new Error("crypto.subtle not available");
    }

    const msgBuffer = new TextEncoder().encode(message);

    const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        msgBuffer
    );

    const hashArray = Array.from(
        new Uint8Array(hashBuffer)
    );

    return hashArray
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}


/* -----------------------------------------------------
   Session — localStorage
----------------------------------------------------- */

function setCurrentUser(user) {

    localStorage.setItem(
        "learnLoopUser",
        JSON.stringify(user)
    );
}


function getCurrentUser() {

    const user = localStorage.getItem("learnLoopUser");

    return user
        ? JSON.parse(user)
        : null;
}


function logout() {

    localStorage.removeItem("learnLoopUser");

    window.location.href = "index.html";
}


/* -----------------------------------------------------
   Get Current User ID
   First JS session format:
   { user_id, email }
----------------------------------------------------- */

function getCurrentUserId() {

    const user = getCurrentUser();

    if (!user) return null;

    return user.user_id || null;
}


/* -----------------------------------------------------
   Get User Name From users Table
----------------------------------------------------- */

async function getCurrentUserName() {

    const userId = getCurrentUserId();

    if (!userId) return "Student";

    try {

        const { data, error } = await supabaseClient
            .from("users")
            .select("name")
            .eq("id", userId)
            .maybeSingle();

        if (error) {
            console.error("User name error:", error);
            return "Student";
        }

        return data?.name || "Student";

    } catch (err) {

        console.error("User name exception:", err);

        return "Student";
    }
}


/* -----------------------------------------------------
   Auth Guard
----------------------------------------------------- */

function requireAuth() {

    const user = getCurrentUser();

    if (!user || !user.user_id) {

        window.location.href = "index.html";

        return null;
    }

    return user;
}


/* -----------------------------------------------------
   Profile Initial
----------------------------------------------------- */

async function setProfileInitial(user) {

    const circle =
        document.querySelector(".profile-circle");

    if (!circle || !user) return;

    try {

        const name = await getCurrentUserName();

        if (name) {

            circle.innerText =
                name.charAt(0).toUpperCase();
        }

    } catch (err) {

        console.error(
            "Profile initial error:",
            err
        );
    }
}


/* -----------------------------------------------------
   Streak Badge
----------------------------------------------------- */

function setStreakBadge(streak) {

    const badge =
        document.getElementById("streakBadge");

    if (badge) {

        badge.innerText =
            "🔥 " + streak + " Day Streak";
    }
}


/* =====================================================
   USER PROGRESS
===================================================== */


/* -----------------------------------------------------
   Ensure Progress Row Exists
----------------------------------------------------- */

async function ensureUserProgress(userId) {

    if (!userId) return;

    const { data, error } = await supabaseClient
        .from("user_progress")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {

        console.error(
            "Progress check error:",
            error
        );

        return;
    }

    if (!data) {

        const { error: insertError } =
            await supabaseClient
                .from("user_progress")
                .insert({
                    user_id: userId
                });

        if (insertError) {

            console.error(
                "Progress creation error:",
                insertError
            );
        }
    }
}


/* -----------------------------------------------------
   Daily Streak Logic
----------------------------------------------------- */

async function updateStreak(userId) {

    if (!userId) return 0;

    await ensureUserProgress(userId);

    const { data, error } = await supabaseClient
        .from("user_progress")
        .select(
            "streak_count, last_active_date"
        )
        .eq("user_id", userId)
        .single();

    if (error || !data) {

        console.error(
            "Streak fetch error:",
            error
        );

        return 0;
    }

    const today =
        new Date()
            .toISOString()
            .slice(0, 10);

    if (data.last_active_date === today) {

        return data.streak_count || 0;
    }

    const yesterday =
        new Date(
            Date.now() - 86400000
        )
            .toISOString()
            .slice(0, 10);

    let newStreak;

    if (
        data.last_active_date === yesterday
    ) {

        newStreak =
            (data.streak_count || 0) + 1;

    } else {

        newStreak = 1;
    }

    const { error: updateError } =
        await supabaseClient
            .from("user_progress")
            .update({
                streak_count: newStreak,
                last_active_date: today,
                updated_at:
                    new Date().toISOString()
            })
            .eq("user_id", userId);

    if (updateError) {

        console.error(
            "Streak update error:",
            updateError
        );
    }

    return newStreak;
}


/* -----------------------------------------------------
   Activity Logger
----------------------------------------------------- */

async function logActivity(
    userId,
    type,
    description
) {

    if (!userId) return;

    const { error } = await supabaseClient
        .from("activity_log")
        .insert({
            user_id: userId,
            activity_type: type,
            description: description
        });

    if (error) {

        console.error(
            "Activity log error:",
            error
        );
    }
}


/* -----------------------------------------------------
   Subject Progress Calculator
----------------------------------------------------- */

async function getSubjectsWithProgress(userId) {

    const {
        data: subjects,
        error: subjectError
    } = await supabaseClient
        .from("subjects")
        .select("*")
        .order("sort_order");

    if (subjectError) {

        console.error(
            "Subjects error:",
            subjectError
        );
    }

    const {
        data: topics,
        error: topicError
    } = await supabaseClient
        .from("topics")
        .select("id, subject_id");

    if (topicError) {

        console.error(
            "Topics error:",
            topicError
        );
    }

    const {
        data: completed,
        error: completedError
    } = await supabaseClient
        .from("topic_progress")
        .select("topic_id")
        .eq("user_id", userId)
        .eq("completed", true);

    if (completedError) {

        console.error(
            "Topic progress error:",
            completedError
        );
    }

    const completedIds =
        new Set(
            (completed || [])
                .map(c => c.topic_id)
        );

    return (subjects || []).map(s => {

        const subjectTopics =
            (topics || [])
                .filter(
                    t => t.subject_id === s.id
                );

        const done =
            subjectTopics
                .filter(
                    t => completedIds.has(t.id)
                )
                .length;

        const percent =
            subjectTopics.length
                ? Math.round(
                    (done /
                        subjectTopics.length) *
                    100
                )
                : 0;

        return {
            ...s,
            totalTopics:
                subjectTopics.length,
            doneTopics:
                done,
            percent:
                percent
        };
    });
}


/* =====================================================
   BLOCK 1 — AUTH
   index.html
===================================================== */


/* -----------------------------------------------------
   Open Login / Signup Popup
----------------------------------------------------- */

function openLogin(type) {

    const overlay =
        document.getElementById("loginOverlay");

    if (!overlay) return;

    overlay.style.display = "flex";

    showAuthForm(
        type === "signup"
            ? "signup"
            : "login"
    );
}


/* -----------------------------------------------------
   Close Login Popup
----------------------------------------------------- */

function closeLogin() {

    const overlay =
        document.getElementById("loginOverlay");

    if (overlay) {

        overlay.style.display = "none";
    }
}


/* -----------------------------------------------------
   Login / Signup Switch
----------------------------------------------------- */

function showAuthForm(type) {

    const loginForm =
        document.getElementById("loginForm");

    const signupForm =
        document.getElementById("signupForm");

    const tabLogin =
        document.getElementById("tabLogin");

    const tabSignup =
        document.getElementById("tabSignup");

    const title =
        document.getElementById("authTitle");

    if (
        !loginForm ||
        !signupForm ||
        !tabLogin ||
        !tabSignup ||
        !title
    ) return;


    if (type === "signup") {

        loginForm.style.display = "none";

        signupForm.style.display = "block";

        tabLogin.classList.remove("active");

        tabSignup.classList.add("active");

        title.innerText =
            "Create your account";

    } else {

        loginForm.style.display = "block";

        signupForm.style.display = "none";

        tabLogin.classList.add("active");

        tabSignup.classList.remove("active");

        title.innerText =
            "Welcome to LearnLoop";
    }
}


/* -----------------------------------------------------
   SIGNUP
----------------------------------------------------- */

async function handleSignup(event) {

    event.preventDefault();

    if (!supabaseClient) {

        alert(
            "Supabase connection available nahi hai."
        );

        return;
    }

    const name =
        document
            .getElementById("signupName")
            .value
            .trim();

    const email =
        document
            .getElementById("signupEmail")
            .value
            .trim()
            .toLowerCase();

    const password =
        document
            .getElementById("signupPassword")
            .value;


    if (!name) {

        alert("Please enter your name.");

        return;
    }


    if (!email) {

        alert("Please enter your email.");

        return;
    }


    if (password.length < 6) {

        alert(
            "Password must be at least 6 characters."
        );

        return;
    }


    /* Check existing user */

    const {
        data: existing,
        error: existingError
    } = await supabaseClient
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();


    if (existingError) {

        console.error(
            "Existing user check error:",
            existingError
        );

        alert(
            "Could not check account: " +
            existingError.message
        );

        return;
    }


    if (existing) {

        alert(
            "This email is already registered. Please login."
        );

        return;
    }


    /* SHA-256 — NO SALT */

    let passwordHash;

    try {

        passwordHash =
            await sha256(password);

    } catch (err) {

        console.error(
            "Password hashing error:",
            err
        );

        return;
    }


    /* Insert user */

    const {
        data,
        error
    } = await supabaseClient
        .from("users")
        .insert({
            name: name,
            email: email,
            password_hash: passwordHash
        })
        .select("id, name, email")
        .single();


    if (error) {

        console.error(
            "Signup error:",
            error
        );

        alert(
            "Signup failed: " +
            error.message
        );

        return;
    }


    /* First JS style session */

    setCurrentUser({
        user_id: data.id,
        email: data.email
    });


    alert(
        "Account created! Welcome to LearnLoop 🚀"
    );

    window.location.href =
        "onboarding.html";
}


/* -----------------------------------------------------
   LOGIN
----------------------------------------------------- */

async function handleLogin(event) {

    event.preventDefault();

    if (!supabaseClient) {

        alert(
            "Supabase connection available nahi hai."
        );

        return;
    }

    const email =
        document
            .getElementById("loginEmail")
            .value
            .trim()
            .toLowerCase();

    const password =
        document
            .getElementById("loginPassword")
            .value;


    if (!email || !password) {

        alert(
            "Please enter email and password."
        );

        return;
    }


    const {
        data: user,
        error
    } = await supabaseClient
        .from("users")
        .select(
            "id, name, email, password_hash"
        )
        .eq("email", email)
        .maybeSingle();


    if (error) {

        console.error(
            "Login query error:",
            error
        );

        alert(
            "Login failed: " +
            error.message
        );

        return;
    }


    if (!user) {

        alert(
            "No account found with this email."
        );

        return;
    }


    /* SHA-256 — NO SALT */

    let passwordHash;

    try {

        passwordHash =
            await sha256(password);

    } catch (err) {

        console.error(
            "Password hashing error:",
            err
        );

        return;
    }


    if (
        passwordHash !==
        user.password_hash
    ) {

        alert(
            "Incorrect password. Please try again."
        );

        return;
    }


    /* First JS style session */

    setCurrentUser({
        user_id: user.id,
        email: user.email
    });


    alert(
        "Login successful! Welcome back 🚀"
    );


    /* Check onboarding */

    const {
        data: profile,
        error: profileError
    } = await supabaseClient
        .from("user_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();


    if (profileError) {

        console.error(
            "Profile check error:",
            profileError
        );
    }


    window.location.href =
        profile
            ? "dashboard.html"
            : "onboarding.html";
}


/* =====================================================
   BLOCK 2 — ONBOARDING
===================================================== */


/* -----------------------------------------------------
   Subject Selection
----------------------------------------------------- */

function selectSubject(button) {

    button.classList.toggle("selected");
}


/* -----------------------------------------------------
   Time Selection
----------------------------------------------------- */

function selectTime(button) {

    document
        .querySelectorAll(".time-btn")
        .forEach(
            b => b.classList.remove("selected")
        );

    button.classList.add("selected");
}


/* -----------------------------------------------------
   Save Onboarding
----------------------------------------------------- */

async function saveOnboarding() {

    const user = requireAuth();

    if (!user) return;

    const userId = user.user_id;


    const year =
        document.getElementById("year").value;

    const branch =
        document.getElementById("branch").value;

    const goal =
        document.getElementById("goal").value;

    const selectedSubjects =
        document.querySelectorAll(
            ".selection-btn.selected"
        );

    const selectedTime =
        document.querySelector(
            ".time-btn.selected"
        );


    if (
        !year ||
        !branch ||
        !goal ||
        selectedSubjects.length === 0 ||
        !selectedTime
    ) {

        alert(
            "Please complete all sections before continuing."
        );

        return;
    }


    let subjects = [];

    selectedSubjects.forEach(
        b => subjects.push(
            b.innerText.trim()
        )
    );


    const {
        error
    } = await supabaseClient
        .from("user_profiles")
        .upsert({

            user_id: userId,

            year: parseInt(year),

            branch: branch,

            subjects: subjects,

            study_time:
                selectedTime.innerText.trim(),

            goal: goal,

            updated_at:
                new Date().toISOString()

        }, {
            onConflict: "user_id"
        });


    if (error) {

        console.error(
            "Onboarding error:",
            error
        );

        alert(
            "Could not save your data: " +
            error.message
        );

        return;
    }


    await logActivity(
        userId,
        "onboarding",
        "Completed profile setup"
    );


    await ensureUserProgress(userId);


    alert(
        "Great! Your learning journey is personalized 🎯"
    );


    window.location.href =
        "dashboard.html";
}


/* =====================================================
   BLOCK 3 — DASHBOARD
===================================================== */


/* -----------------------------------------------------
   Navigation
----------------------------------------------------- */

function goToLearn() {

    window.location.href =
        "learn.html";
}


function startChallenge() {

    window.location.href =
        "challenge.html";
}


function askAI() {

    window.location.href =
        "ai.html";
}


function examMode() {

    window.location.href =
        "exam.html";
}


/* -----------------------------------------------------
   Dashboard Initialization
----------------------------------------------------- */

async function initDashboardPage() {

    const user = requireAuth();

    if (!user) return;

    const userId =
        user.user_id;


    await setProfileInitial(user);


    try {

        /* Streak */

        const streak =
            await updateStreak(userId);

        const streakCount =
            document.getElementById(
                "streakCount"
            );

        if (streakCount) {

            streakCount.innerText =
                streak;
        }


        await ensureUserProgress(userId);


        /* Progress */

        const {
            data: progress,
            error: progressError
        } = await supabaseClient
            .from("user_progress")
            .select("*")
            .eq("user_id", userId)
            .single();


        if (progressError) {

            console.error(
                "Dashboard progress error:",
                progressError
            );
        }


        /* Student Name */

        const studentName =
            document.getElementById(
                "studentName"
            );

        const name =
            await getCurrentUserName();


        if (studentName) {

            studentName.innerText =
                name.split(" ")[0];
        }


        /* Subjects */

        const subjects =
            await getSubjectsWithProgress(
                userId
            );


        const lessonsDone =
            subjects.reduce(
                (sum, s) =>
                    sum + s.doneTopics,
                0
            );


        const statLessons =
            document.getElementById(
                "statLessons"
            );

        if (statLessons) {

            statLessons.innerText =
                lessonsDone;
        }


        const statAccuracy =
            document.getElementById(
                "statAccuracy"
            );

        if (statAccuracy) {

            statAccuracy.innerText =
                (
                    progress
                        ? progress.quiz_accuracy
                        : 0
                ) + "%";
        }


        const mins =
            progress
                ? progress.study_minutes
                : 0;


        const statStudyTime =
            document.getElementById(
                "statStudyTime"
            );


        if (statStudyTime) {

            statStudyTime.innerText =
                mins >= 60
                    ? (mins / 60).toFixed(1) +
                      " hrs"
                    : mins + " min";
        }


        /* Subject Progress */

        const container =
            document.getElementById(
                "subjectProgress"
            );


        if (container) {

            container.innerHTML =
                subjects.map(
                    s => `
                    <div class="subject-row">
                        <div>
                            <strong>
                                ${s.name.replace(
                                    "Engineering ",
                                    ""
                                )}
                            </strong>
                        </div>

                        <span>
                            ${s.percent}%
                        </span>
                    </div>

                    <div class="mini-progress">
                        <div
                            class="mini-progress-fill"
                            style="width:${s.percent}%;">
                        </div>
                    </div>
                    `
                ).join("");
        }


        /* Continue Learning */

        const {
            data: lastTopic,
            error: lastTopicError
        } = await supabaseClient
            .from("topic_progress")
            .select(
                "completed_at, topics(title, subjects(id, name, icon))"
            )
            .eq("user_id", userId)
            .order(
                "completed_at",
                {
                    ascending: false
                }
            )
            .limit(1)
            .maybeSingle();


        if (lastTopicError) {

            console.error(
                "Last topic error:",
                lastTopicError
            );
        }


        let clSubject = "Start Learning";
        let clTopic =
            "Start your first topic!";
        let clPercent = 0;


        if (
            lastTopic &&
            lastTopic.topics
        ) {

            clSubject =
                lastTopic
                    .topics
                    .subjects
                    .name;

            clTopic =
                lastTopic
                    .topics
                    .title;


            const match =
                subjects.find(
                    s =>
                        s.id ===
                        lastTopic
                            .topics
                            .subjects
                            .id
                );


            clPercent =
                match
                    ? match.percent
                    : 0;

        } else if (
            subjects.length > 0
        ) {

            clSubject =
                subjects[0].name;

            clTopic =
                "Start your first topic!";

            clPercent =
                subjects[0].percent;
        }


        const clSubjectEl =
            document.getElementById(
                "clSubject"
            );

        const clTopicEl =
            document.getElementById(
                "clTopic"
            );

        const clFill =
            document.getElementById(
                "clFill"
            );

        const clPercentEl =
            document.getElementById(
                "clPercent"
            );


        if (clSubjectEl)
            clSubjectEl.innerText =
                clSubject;

        if (clTopicEl)
            clTopicEl.innerText =
                clTopic;

        if (clFill)
            clFill.style.width =
                clPercent + "%";

        if (clPercentEl)
            clPercentEl.innerText =
                clPercent +
                "% completed";


    } catch (err) {

        console.error(
            "Dashboard load error:",
            err
        );
    }
}


/* =====================================================
   BLOCK 4 — LEARN PAGE
===================================================== */

let currentTopics = [];

let currentSubjects = [];


/* -----------------------------------------------------
   Initialize Learn Page
----------------------------------------------------- */

async function initLearnPage() {

    const user = requireAuth();

    if (!user) return;

    const userId =
        user.user_id;


    await setProfileInitial(user);


    try {

        updateStreak(userId)
            .then(setStreakBadge)
            .catch(console.error);


        currentSubjects =
            await getSubjectsWithProgress(
                userId
            );


        const grid =
            document.getElementById(
                "subjectGrid"
            );


        if (grid) {

            grid.innerHTML =
                currentSubjects
                    .map(renderSubjectCard)
                    .join("");
        }


        if (
            currentSubjects.length > 0
        ) {

            await showTopics(
                currentSubjects[0].id
            );
        }


    } catch (err) {

        console.error(
            "Learn page load error:",
            err
        );
    }
}


/* -----------------------------------------------------
   Subject Card
----------------------------------------------------- */

function renderSubjectCard(s) {

    return `
        <div class="subject-card">

            <div class="subject-icon">
                ${s.icon}
            </div>

            <h3>
                ${s.name}
            </h3>

            <p>
                ${s.totalTopics}
                Topics •
                ${s.percent}%
                Completed
            </p>

            <div class="progress-bar">

                <div
                    class="progress-fill"
                    style="width:${s.percent}%;">
                </div>

            </div>

            <button
                class="learn-btn"
                onclick="showTopics('${s.id}')">

                Explore Subject →

            </button>

        </div>
    `;
}


/* -----------------------------------------------------
   Show Topics
----------------------------------------------------- */

async function showTopics(subjectId) {

    const subject =
        currentSubjects.find(
            s => s.id === subjectId
        );


    if (!subject) return;


    const topicTitle =
        document.getElementById(
            "topicTitle"
        );

    const topicCount =
        document.getElementById(
            "topicCount"
        );


    if (topicTitle)
        topicTitle.innerText =
            subject.name;


    if (topicCount)
        topicCount.innerText =
            subject.totalTopics +
            " Topics";


    const {
        data: topics,
        error
    } = await supabaseClient
        .from("topics")
        .select("*")
        .eq("subject_id", subjectId)
        .order("order_number");


    if (error) {

        console.error(
            "Topics load error:",
            error
        );
    }


    currentTopics =
        topics || [];


    const topicGrid =
        document.getElementById(
            "topicGrid"
        );


    if (topicGrid) {

        topicGrid.innerHTML =
            currentTopics
                .map(
                    (t, i) =>
                        renderTopicCard(
                            t,
                            i
                        )
                )
                .join("");
    }


    const section =
        document.getElementById(
            "topicsSection"
        );


    if (section) {

        section.scrollIntoView({
            behavior: "smooth"
        });
    }
}


/* -----------------------------------------------------
   Topic Card
----------------------------------------------------- */

function renderTopicCard(
    t,
    index
) {

    const num =
        String(index + 1)
            .padStart(2, "0");


    const done =
        s_isCompleted(t.id);


    return `
        <div class="topic-card">

            <div class="topic-number">
                ${num}
            </div>

            <div class="topic-content">

                <h3>
                    ${t.title}

                    ${
                        done
                            ? '<span style="color:#16a34a;">✅</span>'
                            : ""
                    }

                </h3>

                <p>
                    ${t.description || ""}
                </p>

                <div class="topic-actions">

                    <button
                        onclick="openLearning('${t.id}')">

                        📖 Learn

                    </button>

                    <button
                        onclick="openNotes('${t.id}')">

                        📝 Notes

                    </button>

                </div>

            </div>

        </div>
    `;
}


/* -----------------------------------------------------
   Completed Topics Cache
----------------------------------------------------- */

let completedTopicIds =
    new Set();


function s_isCompleted(topicId) {

    return completedTopicIds.has(
        topicId
    );
}


/* -----------------------------------------------------
   Load Completed Topics
----------------------------------------------------- */

async function loadCompletedTopics(
    userId
) {

    const {
        data,
        error
    } = await supabaseClient
        .from("topic_progress")
        .select("topic_id")
        .eq("user_id", userId)
        .eq("completed", true);


    if (error) {

        console.error(
            "Completed topics error:",
            error
        );
    }


    completedTopicIds =
        new Set(
            (data || [])
                .map(
                    d => d.topic_id
                )
        );
}


/* -----------------------------------------------------
   Open Learning
----------------------------------------------------- */

async function openLearning(topicId) {

    const topic =
        currentTopics.find(
            t => t.id === topicId
        );


    if (!topic) return;


    document.getElementById(
        "popupIcon"
    ).innerText = "📖";


    document.getElementById(
        "popupTitle"
    ).innerText =
        "Learning: " +
        topic.title;


    document.getElementById(
        "popupMessage"
    ).innerText =
        "Your lesson content for " +
        topic.title +
        " will appear here. This lesson has been marked as completed in your progress ✅";


    document.getElementById(
        "learnPopup"
    ).style.display = "flex";


    await markTopicComplete(
        topic
    );
}


/* -----------------------------------------------------
   Mark Topic Complete
----------------------------------------------------- */

async function markTopicComplete(
    topic
) {

    const user =
        getCurrentUser();


    if (!user) return;


    const userId =
        user.user_id;


    const {
        data: existing,
        error: existingError
    } = await supabaseClient
        .from("topic_progress")
        .select("id")
        .eq("user_id", userId)
        .eq("topic_id", topic.id)
        .maybeSingle();


    if (existingError) {

        console.error(
            "Topic progress check error:",
            existingError
        );

        return;
    }


    if (existing) return;


    const {
        error: insertError
    } = await supabaseClient
        .from("topic_progress")
        .insert({

            user_id: userId,

            topic_id: topic.id,

            completed: true,

            completed_at:
                new Date().toISOString()

        });


    if (insertError) {

        console.error(
            "Topic completion error:",
            insertError
        );

        return;
    }


    /* Update cache */

    completedTopicIds.add(
        topic.id
    );


    /* Study minutes */

    const {
        data: p
    } = await supabaseClient
        .from("user_progress")
        .select("study_minutes")
        .eq("user_id", userId)
        .single();


    const currentMinutes =
        p?.study_minutes || 0;


    await supabaseClient
        .from("user_progress")
        .update({

            study_minutes:
                currentMinutes + 20

        })
        .eq(
            "user_id",
            userId
        );


    await logActivity(
        userId,
        "lesson",
        "Completed " +
        topic.title +
        " lesson"
    );
}


/* -----------------------------------------------------
   Notes
----------------------------------------------------- */

function openNotes(topicId) {

    const topic =
        currentTopics.find(
            t => t.id === topicId
        );


    const title =
        topic
            ? topic.title
            : "this topic";


    document.getElementById(
        "popupIcon"
    ).innerText = "📝";


    document.getElementById(
        "popupTitle"
    ).innerText =
        "Handwritten Notes";


    document.getElementById(
        "popupMessage"
    ).innerText =
        "Handwritten notes for " +
        title +
        " will be available here after verified SKIT study material is added.";


    document.getElementById(
        "learnPopup"
    ).style.display = "flex";
}


function openNotesGeneral() {

    document.getElementById(
        "popupIcon"
    ).innerText = "📝";


    document.getElementById(
        "popupTitle"
    ).innerText =
        "Handwritten Notes";


    document.getElementById(
        "popupMessage"
    ).innerText =
        "Handwritten notes for your subjects will be available here after verified SKIT study material is added.";


    document.getElementById(
        "learnPopup"
    ).style.display = "flex";
}


/* -----------------------------------------------------
   Resources
----------------------------------------------------- */

function showResourceMessage() {

    document.getElementById(
        "popupIcon"
    ).innerText = "🎥";


    document.getElementById(
        "popupTitle"
    ).innerText =
        "Learning Resources";


    document.getElementById(
        "popupMessage"
    ).innerText =
        "Useful videos and external learning resources will be added here.";


    document.getElementById(
        "learnPopup"
    ).style.display = "flex";
}


/* -----------------------------------------------------
   Practice
----------------------------------------------------- */

function goToPractice() {

    alert(
        "Practice section will be connected to the Question Bank soon! 🧠"
    );
}


/* -----------------------------------------------------
   Close Learning Popup
----------------------------------------------------- */

function closeLearnPopup() {

    document.getElementById(
        "learnPopup"
    ).style.display = "none";
}


/* =====================================================
   BLOCK 5 — AI STUDY ASSISTANT
===================================================== */


/* -----------------------------------------------------
   Quick Question
----------------------------------------------------- */

function quickQuestion(question) {

    document.getElementById(
        "aiQuestion"
    ).value = question;
}


/* -----------------------------------------------------
   Ask LearnLoop AI
----------------------------------------------------- */

async function askLearnLoopAI() {

    const question =
        document
            .getElementById(
                "aiQuestion"
            )
            .value
            .trim();


    const subject =
        document
            .getElementById(
                "aiSubject"
            )
            .value;


    if (subject === "") {

        alert(
            "Please select a subject first."
        );

        return;
    }


    if (question === "") {

        alert(
            "Please enter your question."
        );

        return;
    }


    let answer = "";

    const q =
        question.toLowerCase();


    if (q.includes("matrix")) {

        answer =
            "A matrix is a rectangular arrangement of numbers, symbols or expressions organised into rows and columns. For example, a 2 × 2 matrix has 2 rows and 2 columns. Matrices are widely used in engineering, computer science and data processing.";

    } else if (
        q.includes("eigenvalue")
    ) {

        answer =
            "An eigenvalue is a special value associated with a square matrix. It tells us how much a particular eigenvector is stretched or compressed when the matrix transformation is applied.";

    } else if (
        q.includes("variable")
    ) {

        answer =
            "A variable in C is a named memory location used to store a value. For example, int age = 18; creates a variable called age that stores the integer value 18.";

    } else if (
        q.includes("newton")
    ) {

        answer =
            "Newton's Second Law states that the force acting on an object is equal to its mass multiplied by its acceleration: F = ma. In simple words, greater force produces greater acceleration when mass remains constant.";

    } else {

        answer =
            "Great question! For the prototype, LearnLoop AI can provide explanations for selected common topics. In the final version, the AI assistant will be connected to a real AI service and will use your learning context to provide personalised explanations.";
    }


    document.getElementById(
        "responseText"
    ).innerText =
        answer;


    document.getElementById(
        "aiResponse"
    ).style.display =
        "block";


    /* Save to Supabase */

    const user =
        getCurrentUser();


    if (user) {

        const userId =
            user.user_id;


        try {

            await supabaseClient
                .from("ai_questions")
                .insert({

                    user_id: userId,

                    subject: subject,

                    question: question,

                    answer: answer

                });


            await logActivity(
                userId,
                "ai",
                "Asked LearnLoop AI • " +
                question.slice(0, 60)
            );


        } catch (err) {

            console.error(
                "AI save error:",
                err
            );
        }
    }
}


/* -----------------------------------------------------
   AI Helper Buttons
----------------------------------------------------- */

function explainSimply() {

    document.getElementById(
        "responseText"
    ).innerText =
        "In very simple words: the concept becomes easier when we break it into small parts. LearnLoop AI can explain the topic step-by-step instead of giving you a complicated textbook definition.";
}


function giveExample() {

    document.getElementById(
        "responseText"
    ).innerText =
        "Example: Think of the concept as something you encounter in real life. Connecting a difficult theory with a simple real-world example makes it easier to remember and understand.";
}


function givePractice() {

    document.getElementById(
        "responseText"
    ).innerText =
        "🧠 Practice Question: Explain the concept you just learned in your own words and give one example. Try solving it without looking at your notes!";
}


/* =====================================================
   BLOCK 6 — DAILY CHALLENGE
===================================================== */


const challengeQuestions = [

    {
        subject: "Mathematics",

        question:
            "What is the order of a matrix having 3 rows and 2 columns?",

        options: [
            "2 × 3",
            "3 × 2",
            "3 × 3",
            "2 × 2"
        ],

        answer: 1
    },

    {
        subject: "Programming",

        question:
            "Which symbol is used to end a statement in C?",

        options: [
            ":",
            ".",
            ";",
            ","
        ],

        answer: 2
    },

    {
        subject: "Physics",

        question:
            "What is the SI unit of force?",

        options: [
            "Joule",
            "Newton",
            "Watt",
            "Pascal"
        ],

        answer: 1
    },

    {
        subject: "Mathematics",

        question:
            "Which of the following is a scalar quantity?",

        options: [
            "Velocity",
            "Force",
            "Acceleration",
            "Temperature"
        ],

        answer: 3
    },

    {
        subject: "Programming",

        question:
            "Which data type is commonly used to store an integer in C?",

        options: [
            "float",
            "char",
            "int",
            "double"
        ],

        answer: 2
    }
];


let currentQuestion = 0;

let score = 0;

let selectedAnswer = null;

let quizFinished = false;

let timeLeft = 300;

let timerInterval;


/* -----------------------------------------------------
   Start Quiz
----------------------------------------------------- */

function startQuiz() {

    currentQuestion = 0;

    score = 0;

    selectedAnswer = null;

    quizFinished = false;

    timeLeft = 300;


    document.getElementById(
        "quizCard"
    ).style.display =
        "block";


    document.getElementById(
        "resultCard"
    ).style.display =
        "none";


    loadQuestion();

    startTimer();
}


/* -----------------------------------------------------
   Load Question
----------------------------------------------------- */

function loadQuestion() {

    const question =
        challengeQuestions[
            currentQuestion
        ];


    document.getElementById(
        "questionNumber"
    ).innerText =
        "Question " +
        (currentQuestion + 1) +
        " of " +
        challengeQuestions.length;


    document.getElementById(
        "questionSubject"
    ).innerText =
        question.subject;


    document.getElementById(
        "questionText"
    ).innerText =
        question.question;


    const optionsContainer =
        document.getElementById(
            "optionsContainer"
        );


    optionsContainer.innerHTML =
        "";


    question.options.forEach(
        function(option, index) {

            const button =
                document.createElement(
                    "button"
                );


            button.className =
                "option-btn";


            button.innerText =
                String.fromCharCode(
                    65 + index
                ) +
                ". " +
                option;


            button.onclick =
                function() {

                    selectAnswer(
                        index,
                        button
                    );
                };


            optionsContainer
                .appendChild(button);
        }
    );


    document.getElementById(
        "answerFeedback"
    ).innerText =
        "";


    document.getElementById(
        "answerFeedback"
    ).style.color =
        "";


    selectedAnswer = null;


    const progress =
        (
            (currentQuestion + 1) /
            challengeQuestions.length
        ) * 100;


    document.getElementById(
        "quizProgress"
    ).style.width =
        progress + "%";
}


/* -----------------------------------------------------
   Select Answer
----------------------------------------------------- */

function selectAnswer(
    index,
    button
) {

    if (
        selectedAnswer !== null
    ) return;


    selectedAnswer =
        index;


    const question =
        challengeQuestions[
            currentQuestion
        ];


    const allOptions =
        document.querySelectorAll(
            ".option-btn"
        );


    allOptions.forEach(
        o => o.disabled = true
    );


    if (
        index === question.answer
    ) {

        button.classList.add(
            "correct"
        );


        score++;


        document.getElementById(
            "answerFeedback"
        ).innerText =
            "✅ Correct! Great job!";


        document.getElementById(
            "answerFeedback"
        ).style.color =
            "#16a34a";


    } else {

        button.classList.add(
            "wrong"
        );


        allOptions[
            question.answer
        ].classList.add(
            "correct"
        );


        document.getElementById(
            "answerFeedback"
        ).innerText =
            "❌ Not quite. The correct answer is " +
            question.options[
                question.answer
            ] +
            ".";


        document.getElementById(
            "answerFeedback"
        ).style.color =
            "#dc2626";
    }
}


/* -----------------------------------------------------
   Next Question
----------------------------------------------------- */

function nextQuestion() {

    if (
        selectedAnswer === null
    ) {

        alert(
            "Please select an answer first."
        );

        return;
    }


    if (
        currentQuestion <
        challengeQuestions.length - 1
    ) {

        currentQuestion++;

        loadQuestion();

    } else {

        finishQuiz();
    }
}


/* -----------------------------------------------------
   Finish Quiz
----------------------------------------------------- */

async function finishQuiz() {

    clearInterval(
        timerInterval
    );


    quizFinished = true;


    document.getElementById(
        "quizCard"
    ).style.display =
        "none";


    document.getElementById(
        "resultCard"
    ).style.display =
        "block";


    const total =
        challengeQuestions.length;


    const wrong =
        total - score;


    const accuracy =
        Math.round(
            (score / total) * 100
        );


    document.getElementById(
        "finalScore"
    ).innerText =
        score + "/" + total;


    document.getElementById(
        "correctAnswers"
    ).innerText =
        score;


    document.getElementById(
        "wrongAnswers"
    ).innerText =
        wrong;


    document.getElementById(
        "accuracy"
    ).innerText =
        accuracy + "%";


    if (
        accuracy === 100
    ) {

        document.getElementById(
            "resultMessage"
        ).innerText =
            "Perfect score! You're on fire! 🔥";

    } else if (
        accuracy >= 60
    ) {

        document.getElementById(
            "resultMessage"
        ).innerText =
            "Great work! Keep practicing to improve further. 💪";

    } else {

        document.getElementById(
            "resultMessage"
        ).innerText =
            "Good attempt! Review the topics and try again. 📚";
    }


    /* Save Result */

    const user =
        getCurrentUser();


    if (!user) return;


    const userId =
        user.user_id;


    try {

        await supabaseClient
            .from("challenge_results")
            .insert({

                user_id: userId,

                score: score,

                total_questions: total,

                accuracy: accuracy

            });


        /* Average Accuracy */

        const {
            data: attempts
        } = await supabaseClient
            .from("challenge_results")
            .select("accuracy")
            .eq("user_id", userId);


        if (
            attempts &&
            attempts.length > 0
        ) {

            const avg =
                Math.round(
                    attempts.reduce(
                        (s, a) =>
                            s + a.accuracy,
                        0
                    ) /
                    attempts.length
                );


            await supabaseClient
                .from("user_progress")
                .update({
                    quiz_accuracy: avg
                })
                .eq(
                    "user_id",
                    userId
                );
        }


        /* Study Minutes */

        const {
            data: p
        } = await supabaseClient
            .from("user_progress")
            .select("study_minutes")
            .eq("user_id", userId)
            .single();


        await supabaseClient
            .from("user_progress")
            .update({

                study_minutes:
                    ((p &&
                        p.study_minutes) ||
                        0) + 5

            })
            .eq(
                "user_id",
                userId
            );


        /* Activity */

        await logActivity(
            userId,
            "challenge",
            "Completed Daily Challenge • " +
            score +
            "/" +
            total +
            " correct"
        );


        /* Streak */

        const {
            data: up
        } = await supabaseClient
            .from("user_progress")
            .select("streak_count")
            .eq("user_id", userId)
            .single();


        const streakText =
            document.getElementById(
                "streakSuccessText"
            );


        if (streakText) {

            streakText.innerText =
                "🔥 " +
                (
                    (up &&
                        up.streak_count) ||
                    1
                ) +
                "-Day Streak Maintained!";
        }


    } catch (err) {

        console.error(
            "Result save error:",
            err
        );
    }
}


/* -----------------------------------------------------
   Timer
----------------------------------------------------- */

function startTimer() {

    clearInterval(
        timerInterval
    );


    const timerElement =
        document.getElementById(
            "timer"
        );


    if (timerElement) {

        timerElement.innerText =
            "⏱️ 05:00";
    }


    timerInterval =
        setInterval(
            function() {

                if (
                    timeLeft <= 0
                ) {

                    clearInterval(
                        timerInterval
                    );

                    finishQuiz();

                    return;
                }


                timeLeft--;


                const minutes =
                    Math.floor(
                        timeLeft / 60
                    );


                const seconds =
                    timeLeft % 60;


                if (timerElement) {

                    timerElement.innerText =
                        "⏱️ " +
                        String(
                            minutes
                        ).padStart(2, "0") +
                        ":" +
                        String(
                            seconds
                        ).padStart(2, "0");
                }

            },
            1000
        );
}


/* -----------------------------------------------------
   Restart Quiz
----------------------------------------------------- */

function restartQuiz() {

    startQuiz();
}


/* =====================================================
   BLOCK 7 — EXAM MODE
===================================================== */


/* -----------------------------------------------------
   Select Exam Subject
----------------------------------------------------- */

function selectExamSubject(
    button,
    subject
) {

    document
        .querySelectorAll(
            ".exam-subject"
        )
        .forEach(
            b =>
                b.classList.remove(
                    "active"
                )
        );


    button.classList.add(
        "active"
    );


    console.log(
        "Selected subject:",
        subject
    );
}


/* -----------------------------------------------------
   Revision Popup
----------------------------------------------------- */

function showRevision(type) {

    const overlay =
        document.getElementById(
            "revisionOverlay"
        );


    const title =
        document.getElementById(
            "revisionTitle"
        );


    const text =
        document.getElementById(
            "revisionText"
        );


    if (
        type === "formulas"
    ) {

        title.innerText =
            "📐 Important Formulas";


        text.innerText =
            "Formula revision content will appear here. For example: Matrix operations, determinants, eigenvalue formulas and other important formulas.";

    } else if (
        type === "concepts"
    ) {

        title.innerText =
            "💡 Key Concepts";


        text.innerText =
            "Important concepts for quick revision will appear here with short and simple explanations.";

    } else if (
        type === "mistakes"
    ) {

        title.innerText =
            "⚠️ Common Mistakes";


        text.innerText =
            "Common mistakes made by students will appear here so you can avoid them during the exam.";
    }


    overlay.style.display =
        "flex";
}


/* -----------------------------------------------------
   Close Revision
----------------------------------------------------- */

function closeRevision() {

    document.getElementById(
        "revisionOverlay"
    ).style.display =
        "none";
}


/* -----------------------------------------------------
   Exam Practice
----------------------------------------------------- */

function startExamPractice() {

    window.location.href =
        "challenge.html";
}


/* -----------------------------------------------------
   Exam Page Init
----------------------------------------------------- */

async function initExamPage() {

    const user =
        requireAuth();


    if (!user) return;


    await setProfileInitial(
        user
    );


    updateStreak(
        user.user_id
    )
        .then(setStreakBadge)
        .catch(console.error);
}


/* =====================================================
   BLOCK 8 — PROGRESS PAGE
===================================================== */


/* -----------------------------------------------------
   Ordinal Year
----------------------------------------------------- */

function ordinalYear(y) {

    return [
        "First Year",
        "Second Year",
        "Third Year",
        "Fourth Year"
    ][y - 1] ||
        (y + " Year");
}


/* -----------------------------------------------------
   Achievement
----------------------------------------------------- */

function setAchievement(
    id,
    unlocked
) {

    const card =
        document.getElementById(id);


    if (!card) return;


    card.classList.remove(
        "unlocked",
        "locked"
    );


    card.classList.add(
        unlocked
            ? "unlocked"
            : "locked"
    );


    const icon =
        card.querySelector(
            ".achievement-icon"
        );


    const status =
        card.querySelector(
            ".achievement-status"
        );


    if (icon) {

        icon.innerText =
            unlocked
                ? card.dataset.icon
                : "🔒";
    }


    if (status) {

        status.innerText =
            unlocked
                ? "Unlocked"
                : "Locked";
    }
}


/* -----------------------------------------------------
   Progress Page
----------------------------------------------------- */

async function initProgressPage() {

    const user =
        requireAuth();


    if (!user) return;


    const userId =
        user.user_id;


    await setProfileInitial(
        user
    );


    try {

        /* Streak */

        const streak =
            await updateStreak(
                userId
            );


        setStreakBadge(
            streak
        );


        /* Subjects */

        const subjects =
            await getSubjectsWithProgress(
                userId
            );


        const overall =
            subjects.length
                ? Math.round(
                    subjects.reduce(
                        (s, x) =>
                            s + x.percent,
                        0
                    ) /
                    subjects.length
                )
                : 0;


        const overallPercent =
            document.getElementById(
                "overallPercent"
            );


        if (overallPercent) {

            overallPercent.innerText =
                overall + "%";
        }


        /* Progress */

        const {
            data: progress
        } = await supabaseClient
            .from("user_progress")
            .select("*")
            .eq("user_id", userId)
            .single();


        const lessonsDone =
            subjects.reduce(
                (sum, s) =>
                    sum + s.doneTopics,
                0
            );


        const prLessons =
            document.getElementById(
                "prLessons"
            );


        if (prLessons) {

            prLessons.innerText =
                lessonsDone;
        }


        const prAccuracy =
            document.getElementById(
                "prAccuracy"
            );


        if (prAccuracy) {

            prAccuracy.innerText =
                (
                    (progress &&
                        progress.quiz_accuracy) ||
                    0
                ) + "%";
        }


        const mins =
            (
                progress &&
                progress.study_minutes
            ) || 0;


        const prStudyTime =
            document.getElementById(
                "prStudyTime"
            );


        if (prStudyTime) {

            prStudyTime.innerText =
                mins >= 60
                    ? (mins / 60).toFixed(1) +
                      " hrs"
                    : mins + " min";
        }


        /* Subject-wise Progress */

        const subjectProgressList =
            document.getElementById(
                "subjectProgressList"
            );


        if (
            subjectProgressList
        ) {

            subjectProgressList.innerHTML =
                subjects.map(
                    s => `
                    <div class="subject-progress-card">

                        <div class="subject-progress-info">

                            <strong>
                                ${s.icon}
                                ${s.name}
                            </strong>

                            <span>
                                ${s.percent}%
                            </span>

                        </div>

                        <div class="progress-bar">

                            <div
                                class="progress-bar-fill"
                                style="width:${s.percent}%;">
                            </div>

                        </div>

                    </div>
                    `
                ).join("");
        }


        /* Achievements */

        setAchievement(
            "achStreak7",
            streak >= 7
        );


        setAchievement(
            "achQuiz",
            (
                (progress &&
                    progress.quiz_accuracy) ||
                0
            ) >= 80
        );


        setAchievement(
            "achLessons10",
            lessonsDone >= 10
        );


        setAchievement(
            "achLegend",
            streak >= 30
        );


        /* Profile */

        const {
            data: profile
        } = await supabaseClient
            .from("user_profiles")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();


        const branchNames = {

            cse: "CSE",

            iot: "CSE-IoT",

            ece: "ECE",

            me: "Mechanical"
        };


        const goalNames = {

            concepts:
                "Improve Concepts",

            exams:
                "Prepare for Exams",

            practice:
                "Practice More",

            grades:
                "Improve Grades"
        };


        const branchText =
            profile
                ? (
                    branchNames[
                        profile.branch
                    ] ||
                    profile.branch
                )
                : "—";


        const yearText =
            profile
                ? ordinalYear(
                    profile.year
                )
                : "—";


        const goalText =
            profile
                ? (
                    goalNames[
                        profile.goal
                    ] ||
                    profile.goal
                )
                : "—";


        const profileSummaryLine =
            document.getElementById(
                "profileSummaryLine"
            );


        if (profileSummaryLine) {

            profileSummaryLine.innerText =
                "B.Tech • " +
                branchText +
                " • " +
                yearText;
        }


        const profileGoal =
            document.getElementById(
                "profileGoal"
            );


        if (profileGoal) {

            profileGoal.innerText =
                "🎯 Goal: " +
                goalText;
        }


        const name =
            await getCurrentUserName();


        const pName =
            document.getElementById(
                "pName"
            );


        if (pName) {

            pName.innerText =
                "Name: " +
                name;
        }


        const pBranch =
            document.getElementById(
                "pBranch"
            );


        if (pBranch) {

            pBranch.innerText =
                "Branch: " +
                branchText;
        }


        const pYear =
            document.getElementById(
                "pYear"
            );


        if (pYear) {

            pYear.innerText =
                "Year: " +
                yearText;
        }


        const pGoal =
            document.getElementById(
                "pGoal"
            );


        if (pGoal) {

            pGoal.innerText =
                "Goal: " +
                goalText;
        }


        /* Recent Activity */

        const {
            data: activities
        } = await supabaseClient
            .from("activity_log")
            .select("*")
            .eq("user_id", userId)
            .order(
                "created_at",
                {
                    ascending: false
                }
            )
            .limit(5);


        const iconMap = {

            lesson: "✅",

            challenge: "🧠",

            ai: "🤖",

            onboarding: "🚀",

            exam: "📝"
        };


        const list =
            document.getElementById(
                "activityList"
            );


        if (!list) return;


        if (
            !activities ||
            activities.length === 0
        ) {

            list.innerHTML =
                `
                <div class="activity-item">

                    <span class="activity-icon">
                        🌱
                    </span>

                    <div>

                        <strong>
                            No activity yet
                        </strong>

                        <small>
                            Start learning to see your activity here
                        </small>

                    </div>

                </div>
                `;

        } else {

            list.innerHTML =
                activities
                    .map(
                        a => `
                        <div class="activity-item">

                            <span class="activity-icon">
                                ${
                                    iconMap[
                                        a.activity_type
                                    ] || "•"
                                }
                            </span>

                            <div>

                                <strong>
                                    ${
                                        a.description ||
                                        a.activity_type
                                    }
                                </strong>

                                <small>
                                    ${
                                        new Date(
                                            a.created_at
                                        ).toLocaleString()
                                    }
                                </small>

                            </div>

                        </div>
                        `
                    )
                    .join("");
        }


    } catch (err) {

        console.error(
            "Progress load error:",
            err
        );
    }
}


/* =====================================================
   BLOCK 9 — PROFILE POPUP
===================================================== */


function showProfileMessage() {

    document.getElementById(
        "profileOverlay"
    ).style.display =
        "flex";
}


function closeProfileMessage() {

    document.getElementById(
        "profileOverlay"
    ).style.display =
        "none";
}


/* =====================================================
   PAGE ROUTER
===================================================== */


document.addEventListener(
    "DOMContentLoaded",
    function() {

        /* -------------------------------------------------
           Supabase Check
        ------------------------------------------------- */

        if (!supabaseClient) {

            console.error(
                "❌ Supabase client not initialized. Check supabase-config.js and script order."
            );

            return;
        }


        const page =
            document.body.id;


        /* -------------------------------------------------
           INDEX
        ------------------------------------------------- */

        if (
            page === "page-index"
        ) {

            if (
                getCurrentUser()
            ) {

                window.location.href =
                    "dashboard.html";
            }
        }


        /* -------------------------------------------------
           ONBOARDING
        ------------------------------------------------- */

        else if (
            page === "page-onboarding"
        ) {

            const user =
                requireAuth();


            if (user) {

                setProfileInitial(
                    user
                );
            }
        }


        /* -------------------------------------------------
           DASHBOARD
        ------------------------------------------------- */

        else if (
            page === "page-dashboard"
        ) {

            initDashboardPage();
        }


        /* -------------------------------------------------
           LEARN
        ------------------------------------------------- */

        else if (
            page === "page-learn"
        ) {

            const user =
                requireAuth();


            if (user) {

                loadCompletedTopics(
                    user.user_id
                )
                    .then(
                        () =>
                            initLearnPage()
                    )
                    .catch(
                        console.error
                    );
            }
        }


        /* -------------------------------------------------
           AI
        ------------------------------------------------- */

        else if (
            page === "page-ai"
        ) {

            const user =
                requireAuth();


            if (user) {

                setProfileInitial(
                    user
                );
            }
        }


        /* -------------------------------------------------
           CHALLENGE
        ------------------------------------------------- */

        else if (
            page === "page-challenge"
        ) {

            const user =
                requireAuth();


            if (!user) return;


            setProfileInitial(
                user
            );


            updateStreak(
                user.user_id
            )
                .then(
                    setStreakBadge
                )
                .catch(
                    console.error
                )
                .finally(
                    () =>
                        startQuiz()
                );
        }


        /* -------------------------------------------------
           PROGRESS
        ------------------------------------------------- */

        else if (
            page === "page-progress"
        ) {

            initProgressPage();
        }


        /* -------------------------------------------------
           EXAM
        ------------------------------------------------- */

        else if (
            page === "page-exam"
        ) {

            initExamPage();
        }

    }
);
