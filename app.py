import streamlit as st
import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_community.document_loaders import TextLoader
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
try:
    from langchain.chains import create_history_aware_retriever, create_retrieval_chain
    from langchain.chains.combine_documents import create_stuff_documents_chain
except ImportError:
    from langchain_classic.chains import create_history_aware_retriever, create_retrieval_chain
    from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import HumanMessage, AIMessage
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory

# Load environment variables
load_dotenv()

st.title("Hi I am ClimaMind a Context-Aware Chatbot (Groq + RAG)")
st.write("Ask questions regarding Global Warming. Powered by Groq and LangChain.")

# 1️⃣ Load Document
loader = TextLoader("knowledge_base.txt")
documents = loader.load()

# 2️⃣ Split into chunks
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50
)
docs = text_splitter.split_documents(documents)

# 3️⃣ Create Embeddings (FREE - HuggingFace)
embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2",
    model_kwargs={'device': 'cpu'}
)

# 4️⃣ Create Vector Store
vectorstore = FAISS.from_documents(docs, embeddings)
retriever = vectorstore.as_retriever()

def get_api_key(key_name):
    value = os.getenv(key_name)
    if value is None:
        try:
            value = st.secrets[key_name]
        except Exception:
            value = None
    return value

API = get_api_key("GROQ_API_KEY")

if not API:
    st.error("❌ GROQ_API_KEY nahi mili. Streamlit Secrets check karo.")
    st.stop()

llm = ChatGroq(
    groq_api_key=API,
    model_name="openai/gpt-oss-120b",
    temperature=0.3
)

# 5️⃣ History-aware retriever (chat history ke context se query reformulate karta hai)
contextualize_q_system_prompt = (
    "Given a chat history and the latest user question, "
    "formulate a standalone question which can be understood "
    "without the chat history. Do NOT answer the question, "
    "just reformulate it if needed and otherwise return it as is."
)
contextualize_q_prompt = ChatPromptTemplate.from_messages([
    ("system", contextualize_q_system_prompt),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
])
history_aware_retriever = create_history_aware_retriever(
    llm, retriever, contextualize_q_prompt
)

# 6️⃣ Question-answering chain
qa_system_prompt = (
    "You are an assistant for question-answering tasks about Global Warming. "
    "Use the following pieces of retrieved context to answer the question. "
    "If you don't know the answer, say that you don't know. "
    "Keep the answer concise.\n\n{context}"
)
qa_prompt = ChatPromptTemplate.from_messages([
    ("system", qa_system_prompt),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
])
question_answer_chain = create_stuff_documents_chain(llm, qa_prompt)

rag_chain = create_retrieval_chain(history_aware_retriever, question_answer_chain)

# 7️⃣ Session-based chat history (Streamlit session_state use kar rahe hain)
if "chat_history_store" not in st.session_state:
    st.session_state.chat_history_store = {}

def get_session_history(session_id: str) -> BaseChatMessageHistory:
    if session_id not in st.session_state.chat_history_store:
        st.session_state.chat_history_store[session_id] = ChatMessageHistory()
    return st.session_state.chat_history_store[session_id]

conversational_rag_chain = RunnableWithMessageHistory(
    rag_chain,
    get_session_history,
    input_messages_key="input",
    history_messages_key="chat_history",
    output_messages_key="answer",
)

# Chat Input
user_question = st.text_input("Ask your question:")
if user_question:
    response = conversational_rag_chain.invoke(
        {"input": user_question},
        config={"configurable": {"session_id": "default_session"}},
    )
    st.write("### Answer:")
    st.write(response["answer"])
