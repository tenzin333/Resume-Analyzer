import { NextRequest, NextResponse } from 'next/server';

type AnalysisType = 'analyze' | 'cover-letter' | 'rewrite-resume';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'API key not configured' }, 
        { status: 500 }
      );
    }

    const { resumeText, jobDesc, analysisType, additionalInfo } = await request.json();
    
    if (!resumeText || !jobDesc || !analysisType) {
      return NextResponse.json(
        { error: 'Resume text, job description, and analysis type are required' }, 
        { status: 400 }
      );
    }

    let prompt = '';

    switch (analysisType as AnalysisType) {
      case 'analyze':
        prompt = `
You are a professional ATS (Applicant Tracking System) analyzer. Analyze the resume against the job description and provide EXACTLY the following format:

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDesc}

Provide your analysis in this EXACT format:

MATCH_SCORE: [number between 0-100]

MISSING_KEYWORDS: [comma-separated list of important keywords/skills from job description that are missing from resume]

REWRITTEN_SUMMARY: [A 3-4 sentence professional summary that incorporates missing keywords and better aligns with the job requirements. Make it specific to this role and include relevant skills/experience.]

Instructions:
- Match score should reflect how well the resume aligns with job requirements
- Missing keywords should be technical skills, tools, qualifications, or important terms from the job description
- Rewritten summary should be tailored specifically for this job application
- Keep the format exactly as specified above
- Be concise but accurate
        `;
        break;

      case 'cover-letter':
        prompt = `
You are a professional career counselor. Write a compelling cover letter based on the resume and job description provided.

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDesc}

ADDITIONAL INFO (if provided):
${additionalInfo || 'None provided'}

Write a professional cover letter that:
1. Has a strong opening that grabs attention
2. Highlights relevant experience from the resume that matches the job
3. Shows enthusiasm for the role and company
4. Includes specific achievements and quantifiable results where possible
5. Has a compelling closing that requests action
6. Is 3-4 paragraphs long
7. Uses a professional but engaging tone

Format the cover letter with proper business letter structure including placeholders for:
[Your Name]
[Your Address]
[City, State ZIP Code]
[Your Email]
[Your Phone]
[Date]

[Hiring Manager's Name]
[Company Name]
[Company Address]
[City, State ZIP Code]

Dear [Hiring Manager's Name / Hiring Manager],

[Cover letter content]

Sincerely,
[Your Name]
        `;
        break;

      case 'rewrite-resume':
        prompt = `
You are a professional resume writer and career coach. Rewrite the provided resume to better match the job description while maintaining truthfulness and the candidate's actual experience.

ORIGINAL RESUME:
${resumeText}

TARGET JOB DESCRIPTION:
${jobDesc}

FOCUS AREAS (if provided):
${additionalInfo || 'General optimization'}

Please rewrite the resume with the following improvements:
1. Optimize the professional summary/objective for this specific job
2. Reorder and rewrite experience bullets to highlight relevant skills
3. Add relevant keywords naturally throughout
4. Quantify achievements where possible
5. Ensure ATS-friendly formatting
6. Tailor skills section to match job requirements
7. Keep all information truthful - only reframe, don't fabricate

Provide the rewritten resume in a clean, professional format with clear sections:
- Professional Summary
- Core Skills/Technical Skills
- Professional Experience
- Education
- Additional relevant sections as needed

Make it compelling while staying honest about the candidate's background.
        `;
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid analysis type' }, 
          { status: 400 }
        );
    }

    // API call to Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: analysisType === 'analyze' ? 0.3 : 0.7,
            topK: 40,
            topP: 0.8,
            maxOutputTokens: analysisType === 'analyze' ? 1024 : 2048,
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API Error:', response.status, errorData);
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response format from Gemini API');
    }

    const generatedText = data.candidates[0].content.parts[0].text;
    
    // Parse response based on analysis type
    if (analysisType === 'analyze') {
      const parseResponse = (text: string) => {
        const matchScoreMatch = text.match(/MATCH_SCORE:\s*(\d+)/i);
        const keywordsMatch = text.match(/MISSING_KEYWORDS:\s*([^\n]+)/i);
        const summaryMatch = text.match(/REWRITTEN_SUMMARY:\s*([\s\S]+?)(?=\n\n|$)/i);
        
        return {
          matchScore: matchScoreMatch ? parseInt(matchScoreMatch[1]) : 0,
          missingKeywords: keywordsMatch ? keywordsMatch[1].trim() : 'No keywords identified',
          rewrittenSummary: summaryMatch ? summaryMatch[1].trim() : 'Unable to generate summary'
        };
      };

      const parsedResult = parseResponse(generatedText);

      return NextResponse.json({ 
        success: true,
        analysisType,
        matchScore: parsedResult.matchScore,
        missingKeywords: parsedResult.missingKeywords,
        rewrittenSummary: parsedResult.rewrittenSummary,
      });
    } else {
      // For cover letter and resume rewrite, return the full text
      return NextResponse.json({ 
        success: true,
        analysisType,
        content: generatedText,
      });
    }

  } catch (error) {
    console.error('Gemini API error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('API_KEY')) {
        return NextResponse.json(
          { error: 'Invalid API key. Please check your Gemini API key.' }, 
          { status: 401 }
        );
      }
      if (error.message.includes('429') || error.message.includes('quota')) {
        return NextResponse.json(
          { error: 'API quota exceeded. Please try again later.' }, 
          { status: 429 }
        );
      }
    }
    
    return NextResponse.json(
      { error: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}` }, 
      { status: 500 }
    );
  }
}