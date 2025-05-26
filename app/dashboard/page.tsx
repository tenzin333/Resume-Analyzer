"use client";

import { useRef, useState, useEffect } from "react";
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/utility/ProtectedRoute';
import { collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/fireBaseConfig';

type ActiveTab = 'analyze' | 'cover-letter' | 'rewrite-resume';

interface AnalysisResult {
  matchScore?: number;
  missingKeywords?: string;
  rewrittenSummary?: string;
  content?: string;
  analysisType: string;
  success: boolean;
}

interface SavedAnalysis {
  id: string;
  type: ActiveTab;
  jobTitle: string;
  company: string;
  matchScore?: number;
  createdAt: Date;
}

function ResumeToolsApp() {
  const { currentUser, logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('analyze');
  const [fileName, setFileName] = useState("No file chosen");
  const [formData, setFormData] = useState({
    resumeText: "",
    jobDescription: "",
    additionalInfo: "",
    jobTitle: "",
    company: "",
  });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfjs, setPdfjs] = useState<any>(null);
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Load pdfjs from CDN
  useEffect(() => {
    const loadPdfjs = async () => {
      if (typeof window !== 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
          const pdfjsLib = (window as any).pdfjsLib;
          pdfjsLib.GlobalWorkerOptions.workerSrc = 
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          setPdfjs(pdfjsLib);
        };
        document.head.appendChild(script);
      }
    };

    loadPdfjs();
  }, []);

  // Load user's saved analyses
  useEffect(() => {
    if (currentUser) {
      loadSavedAnalyses();
    }
  }, [currentUser]);

  const loadSavedAnalyses = async () => {
    if (!currentUser) return;

    try {
      const q = query(
        collection(db, 'analyses'),
        where('userId', '==', currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(q);
      const analyses: SavedAnalysis[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        analyses.push({
          id: doc.id,
          type: data.type,
          jobTitle: data.jobTitle,
          company: data.company,
          matchScore: data.matchScore,
          createdAt: data.createdAt.toDate(),
        });
      });
      
      setSavedAnalyses(analyses);
    } catch (error) {
      console.error('Error loading saved analyses:', error);
    }
  };

  const saveAnalysis = async () => {
    if (!currentUser || !result || !formData.jobTitle || !formData.company) return;

    try {
      const analysisData = {
        userId: currentUser.uid,
        type: activeTab,
        jobTitle: formData.jobTitle,
        company: formData.company,
        jobDescription: formData.jobDescription,
        resumeText: formData.resumeText,
        result: result,
        matchScore: result.matchScore || null,
        createdAt: new Date(),
      };

      await addDoc(collection(db, 'analyses'), analysisData);
      setShowSaveDialog(false);
      loadSavedAnalyses();
      
      // Reset job title and company
      setFormData(prev => ({ ...prev, jobTitle: '', company: '' }));
    } catch (error) {
      console.error('Error saving analysis:', error);
      setError('Failed to save analysis. Please try again.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    setError(null);
    
    if (files && files.length > 0 && pdfjs) {
      setFileName(files[0].name);
      setLoading(true);
      
      try {
        const text = await extractTextFromPDF(files[0]);
        if (text.trim().length === 0) {
          setError("Could not extract text from PDF. Please ensure it's a text-based PDF.");
          setFileName("No file chosen");
          setFormData((prev) => ({ ...prev, resumeText: "" }));
        } else {
          setFormData((prev) => ({ ...prev, resumeText: text }));
        }
      } catch (err) {
        setError("Error reading PDF file. Please try a different file.");
        setFileName("No file chosen");
        setFormData((prev) => ({ ...prev, resumeText: "" }));
      } finally {
        setLoading(false);
      }
    } else {
      setFileName("No file chosen");
      setFormData((prev) => ({ ...prev, resumeText: "" }));
    }
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    if (!pdfjs) throw new Error("PDF.js not loaded");
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += pageText + "\n";
    }

    return fullText;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: formData.resumeText,
          jobDesc: formData.jobDescription,
          analysisType: activeTab,
          additionalInfo: formData.additionalInfo,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to process request');
      }

      setResult(data);
      
      // Show save dialog for successful analyses
      if (data.success) {
        setShowSaveDialog(true);
      }
    } catch (error) {
      console.error('Processing error:', error);
      setError(error instanceof Error ? error.message : "Error processing request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const handleFileNameClick = () => {
    fileInputRef.current?.click();
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600"; 
    return "text-red-600";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return "bg-green-100";
    if (score >= 60) return "bg-yellow-100";
    return "bg-red-100";
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getTabConfig = () => {
    switch (activeTab) {
      case 'analyze':
        return {
          title: 'Resume ATS Analyzer',
          subtitle: 'Get your match score, missing keywords, and optimized summary',
          buttonText: 'Analyze Resume',
          showAdditionalInfo: false,
          additionalLabel: '',
          additionalPlaceholder: ''
        };
      case 'cover-letter':
        return {
          title: 'AI Cover Letter Generator',
          subtitle: 'Generate a personalized cover letter for this job application',
          buttonText: 'Generate Cover Letter',
          showAdditionalInfo: true,
          additionalLabel: 'Additional Information (Optional)',
          additionalPlaceholder: 'Any specific achievements, company research, or personal connection to mention...'
        };
      case 'rewrite-resume':
        return {
          title: 'AI Resume Rewriter',
          subtitle: 'Optimize your resume to better match the job requirements',
          buttonText: 'Rewrite Resume',
          showAdditionalInfo: true,
          additionalLabel: 'Focus Areas (Optional)',
          additionalPlaceholder: 'Specific sections to focus on (e.g., technical skills, leadership experience, etc.)...'
        };
    }
  };

  const config = getTabConfig();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header with User Info */}
        <div className="flex justify-between items-center mb-8">
          <div className="text-center flex-1">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">
              AI-Powered Resume Tools
            </h1>
            <p className="text-gray-600">
              Analyze, optimize, and enhance your job application materials
            </p>
          </div>
          
          {/* User Menu */}
       
        </div>
           <div className="w-full flex justify-end space-x-5 pb-2">
            <div className="text-sm text-gray-600">
              Welcome, {currentUser?.displayName || currentUser?.email}
            </div>
            <button
              onClick={logout}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Sign Out
            </button>
          </div>

        {/* Saved Analyses History */}
        {savedAnalyses.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg mb-8 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Analyses</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedAnalyses.map((analysis) => (
                <div key={analysis.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-gray-800 truncate">{analysis.jobTitle}</h4>
                    {analysis.matchScore && (
                      <span className={`text-sm font-semibold ${getScoreColor(analysis.matchScore)}`}>
                        {analysis.matchScore}%
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 truncate">{analysis.company}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-gray-500">
                      {analysis.createdAt.toLocaleDateString()}
                    </span>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {analysis.type.replace('-', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Tool Interface */}
        <div className="bg-white rounded-lg shadow-lg mb-8">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('analyze')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                activeTab === 'analyze'
                  ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              📊 Analyze Resume
            </button>
            <button
              onClick={() => setActiveTab('cover-letter')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                activeTab === 'cover-letter'
                  ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              📝 Cover Letter
            </button>
            <button
              onClick={() => setActiveTab('rewrite-resume')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                activeTab === 'rewrite-resume'
                  ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              ✨ Rewrite Resume
            </button>
          </div>

          {/* Form Content */}
          <div className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                {config.title}
              </h2>
              <p className="text-gray-600">
                {config.subtitle}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* File Upload Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Resume (PDF)
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div
                  onClick={handleFileNameClick}
                  className="cursor-pointer border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="text-gray-600">
                    {fileName === "No file chosen" ? (
                      <span>Click to upload your resume (PDF only)</span>
                    ) : (
                      <span className="text-blue-600 font-medium">{fileName}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Job Description Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job Description
                </label>
                <textarea
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Paste the job description here..."
                  onChange={(e) => handleInputChange('jobDescription', e.target.value)}
                  value={formData.jobDescription}
                  required
                />
              </div>

              {/* Additional Info Section */}
              {config.showAdditionalInfo && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {config.additionalLabel}
                  </label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={config.additionalPlaceholder}
                    onChange={(e) => handleInputChange('additionalInfo', e.target.value)}
                    value={formData.additionalInfo}
                  />
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="text-red-800 text-sm">{error}</div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={loading || !formData.resumeText || !formData.jobDescription}
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </span>
                ) : (
                  config.buttonText
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Save Dialog */}
        {showSaveDialog && result && result.success && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Save Analysis</h3>
              <p className="text-gray-600 mb-4">Save this analysis to your dashboard for future reference.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={formData.jobTitle}
                    onChange={(e) => handleInputChange('jobTitle', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Software Engineer"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => handleInputChange('company', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Google"
                    required
                  />
                </div>
              </div>
              
              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
                >
                  Skip
                </button>
                <button
                  onClick={saveAnalysis}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  disabled={!formData.jobTitle || !formData.company}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results Section - Same as before */}
        {result && result.success && (
          <div className="space-y-6">
            {/* Analysis Results */}
            {result.analysisType === 'analyze' && (
              <>
                {/* Match Score */}
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">📊 Match Score</h2>
                  <div className={`inline-flex items-center px-6 py-3 rounded-full ${getScoreBgColor(result.matchScore!)}`}>
                    <span className={`text-3xl font-bold ${getScoreColor(result.matchScore!)}`}>
                      {result.matchScore}/100
                    </span>
                  </div>
                  <div className="mt-3 text-gray-600">
                    {result.matchScore! >= 80 && "Excellent match! Your resume aligns very well with this job."}
                    {result.matchScore! >= 60 && result.matchScore! < 80 && "Good match! Some improvements could help."}
                    {result.matchScore! < 60 && "Needs improvement. Consider adding missing keywords and skills."}
                  </div>
                </div>

                {/* Missing Keywords */}
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">🔑 Missing Keywords</h2>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <p className="text-gray-700 leading-relaxed">
                      <strong>Add these keywords to improve your ATS score:</strong>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {result.missingKeywords!.split(',').map((keyword, index) => (
                        <span 
                          key={index}
                          className="inline-block bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium"
                        >
                          {keyword.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Rewritten Summary */}
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-2xl font-bold text-gray-800 mb-4">✨ Optimized Summary</h2>
                  <div className="bg-green-50 border border-green-200 rounded-md p-4">
                    <p className="text-gray-700 mb-3">
                      <strong>Replace your current summary with this optimized version:</strong>
                    </p>
                    <div className="bg-white p-4 rounded border-l-4 border-green-500 relative">
                      <p className="text-gray-800 leading-relaxed italic">
                        "{result.rewrittenSummary}"
                      </p>
                      <button
                        onClick={() => copyToClipboard(result.rewrittenSummary!)}
                        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                        title="Copy to clipboard"
                      >
                        📋
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 mt-3">
                      💡 This summary incorporates relevant keywords and aligns with the job requirements.
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Cover Letter Results */}
            {result.analysisType === 'cover-letter' && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">📝 Generated Cover Letter</h2>
                  <button
                    onClick={() => copyToClipboard(result.content!)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                  >
                    📋 Copy to Clipboard
                  </button>
                </div>
                <div className="bg-gray-50 border rounded-md p-6">
                  <pre className="whitespace-pre-wrap text-gray-800 leading-relaxed font-sans">
                    {result.content}
                  </pre>
                </div>
                <p className="text-sm text-gray-600 mt-3">
                  💡 Customize the placeholders with your specific information before sending.
                </p>
              </div>
            )}

            {/* Resume Rewrite Results */}
            {result.analysisType === 'rewrite-resume' && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">✨ Rewritten Resume</h2>
                  <button
                    onClick={() => copyToClipboard(result.content!)}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                  >
                    📋 Copy to Clipboard
                  </button>
                </div>
                <div className="bg-gray-50 border rounded-md p-6">
                  <pre className="whitespace-pre-wrap text-gray-800 leading-relaxed font-sans">
                    {result.content}
                  </pre>
                </div>
                <p className="text-sm text-gray-600 mt-3">
                  💡 Review and adjust the content to ensure accuracy before using in applications.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <ProtectedRoute>
      <ResumeToolsApp />
    </ProtectedRoute>
  );
}