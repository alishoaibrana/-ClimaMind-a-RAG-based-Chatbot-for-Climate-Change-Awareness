ClimaMind Context-Aware Climate Chatbot (RAG + Groq)

ClimaMind is a Retrieval-Augmented Generation (RAG) chatbot that answers questions about Global Warming and Climate Change, grounded in a custom knowledge base. It combines LangChain, Groq's ultra-fast LLM inference, and FAISS vector search to deliver accurate, context-aware, multiturn conversations.

Features


Retrieval-Augmented Generation (RAG): answers are grounded in a curated knowledge base instead of relying purely on the LLM's internal knowledge, reducing hallucination.
History-Aware Retrieval: reformulates follow-up questions using chat history so the retriever understands context (e.g., "what about its effects?" after asking about CO2 emissions).
Multi-turn Conversational Memory: maintains per-session chat history using LangChain's RunnableWithMessageHistory.
Fast Inference with Groq: powered by the openai/gpt-oss-120b model served on Groq's LPU inference engine for near-instant responses.
Free, Local Embeddings: uses HuggingFace's all-MiniLM-L6-v2 sentence-transformer model (runs on CPU, no API cost).
Simple, Clean UI: built entirely with Streamlit, no frontend code required.



How It Works


Document Loading: Climate-related knowledge is loaded from knowledge_base.txt.
Chunking: The document is split into overlapping chunks (chunk_size=500, chunk_overlap=50) using RecursiveCharacterTextSplitter for better retrieval granularity.
Embedding: Each chunk is converted into a vector using the all-MiniLM-L6-v2 HuggingFace embedding model.
Vector Store: Chunks are indexed in a FAISS vector store for fast similarity search.
History Aware Retriever: Given the chat history and a new question, the LLM reformulates it into a standalone question (so context isn't lost across turns).
Retrieval + Answer Generation: Relevant chunks are retrieved and passed to the Groq LLM along with the question to generate a concise, grounded answer.
Session Memory: Each conversation session stores its own chat history in st.session_state, enabling coherent multi-turn dialogue.


User Question
     |
     v
[History-Aware Retriever] --> reformulates question using chat history
     |
     v
[FAISS Vector Search] --> retrieves top relevant chunks from knowledge_base.txt
     |
     v
[Groq LLM + QA Prompt] --> generates concise, context-grounded answer
     |
     v
Answer displayed in Streamlit UI


Tech Stack

LayerTechnologyFrontend / UIStreamlitLLM InferenceGroq (openai/gpt-oss-120b)OrchestrationLangChain (langchain, langchain-core, langchain-community, langchain-groq)Vector StoreFAISSEmbeddingsHuggingFace Sentence Transformers (all-MiniLM-L6-v2)Environment Configpython-dotenv / Streamlit SecretsLanguagePython


Installation & Local Setup


Clone the repository


bash   git clone https://github.com/<your-username>/ClimaMind.git
   cd ClimaMind


Create a virtual environment (recommended)


bash   python -m venv venv
   source venv/bin/activate   # On Windows: venv\Scripts\activate


Install dependencies


bash   pip install -r requirements.txt


Set up your API key
Create a .env file in the project root:


env   GROQ_API_KEY=your_groq_api_key_here

Get a free API key from console.groq.com.


Add your knowledge base
Place your climate/global-warming content in knowledge_base.txt in the project root.
Run the app


bash   streamlit run new_app.py


requirements.txt (reference)

streamlit
python-dotenv
langchain
langchain-core
langchain-community
langchain-groq
langchain-text-splitters
faiss-cpu
sentence-transformers
huggingface-hub

(Pin exact versions in your actual requirements.txt to avoid dependency conflicts on Streamlit Cloud.)
