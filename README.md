![Endpointr Logo](frontend/src/assets/endpointr.svg)

# Endpointr

Endpointr is a powerful full-stack developer tool designed to securely build, proxy, and test API queries. It features built-in conversational AI (powered by LangChain and Google's Gemini models) to debug network requests, evaluate histories using vector embeddings, and conduct passive security header pentesting automatically. 

## Features
- **API Request Builder:** Customize and dispatch proxy network requests (GET, POST, etc.) directly from the dashboard.
- **AI Debugger Chat:** An integrated Gemini Assistant equipped with persistent RAG memory (via LangChain `gemini-embedding-001` vectors and Cosine Similarity). Provides tailored guidance depending on previous context.
- **Passive Security Pentesting:** Automatically scans HTTP responses for critical security headers (like `X-Content-Type-Options`, `Content-Security-Policy`, and `Strict-Transport-Security`). Missing headers instantly trigger an actionable "Ask AI" remediation button.
- **Authentication:** Integrated Clerk user authentication. 
- **Dark / Light Mode & Markdown Support:** A highly capable React UI with toggleable dark themes and neatly formatted robust Markdown responses. 

## Technology Stack
- **Frontend:** React, Vite, Clerk (`@clerk/react`), React-Markdown.
- **Backend:** Django 6.0, Python 3.11, Django-Cors-Headers.
- **AI Core:** LangChain, Google GenAI (`gemini-2.5-flash`), `gemini-embedding-001` embeddings.
- **Database:** SQLite3.

---

## 🚀 Getting Started

Follow the instructions below to clone, configure, and launch the project on your local machine.

### Prerequisites
- Node.js (v18+)
- Python 3.11+
- [Clerk Account](https://clerk.dev) (for frontend authentication keys)
- [Google AI Studio Key](https://aistudio.google.com/app/apikey) (for Gemini access)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/Endpointr.git
cd Endpointr
```

### 2. Backend Setup
Navigate into the `backend` folder and establish your isolated python environment.

```bash
cd backend
python -m venv .venv

# Activate the virtual environment
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install the Python dependencies (Requirements generated via pip freeze)
pip install -r requirements.txt
```

Create a `.env` file in the `backend` directory containing:
```env
GEMINI_API_KEY=your_google_ai_studio_key_here
GEMINI_MODEL=gemini-2.5-flash
# Optional: Enforce authentication in dev
API_PROXY_REQUIRE_AUTH=false
```

Run database migrations:
```bash
python manage.py migrate
```

Start the Django server:
```bash
python manage.py runserver
```

### 3. Frontend Setup
Open a new terminal session, navigate to the `frontend` directory, and install node modules.

```bash
cd frontend
npm install
```

Create a `.env` file in the `frontend` directory: 
```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here
```

Start the Vite development server:
```bash
npm run dev
```

### 4. Open Application
Navigate to `http://localhost:5173` in your web browser. You'll be prompted to utilize Clerk for sign-in, ultimately routing you to your secure Endpointr dashboard! 
