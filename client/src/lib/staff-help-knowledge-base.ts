export interface HelpArticle {
  id: string;
  question: string;
  answer: string;
  category: 'check-in' | 'printing' | 'scanning' | 'attendees' | 'general' | 'troubleshooting';
  keywords: string[];
  relatedArticles?: string[];
}

export const staffHelpKnowledgeBase: HelpArticle[] = [
  // Check-in Category
  {
    id: 'checkin-how',
    question: 'How do I check in an attendee?',
    answer: 'You can check in an attendee by either: 1) Searching for their name in the search bar and clicking the check-in button, or 2) Scanning their QR code using the QR Scanner tab. Once checked in, their status will update and you can print their badge.',
    category: 'check-in',
    keywords: ['check in', 'checkin', 'register', 'arrival', 'attendee'],
    relatedArticles: ['scanning-qr', 'print-badge']
  },
  {
    id: 'checkin-undo',
    question: 'How do I undo a check-in?',
    answer: 'Find the attendee in the list or search for them. Click the three-dot menu (⋮) next to their name and select "Undo Check-in". This will reset their status to not checked in. Note: If a badge was already printed, you may want to collect it.',
    category: 'check-in',
    keywords: ['undo', 'reverse', 'cancel', 'mistake', 'wrong person'],
    relatedArticles: ['checkin-how']
  },
  {
    id: 'checkin-workflow',
    question: 'What are workflow steps and how do they work?',
    answer: 'Some events have workflow steps that must be completed before check-in. These may include answering questions, signing disclaimers, or other verification steps. Follow the on-screen prompts to complete each step. The check-in will only complete once all required steps are done.',
    category: 'check-in',
    keywords: ['workflow', 'steps', 'questions', 'disclaimer', 'waiver', 'form'],
    relatedArticles: ['checkin-how']
  },
  {
    id: 'checkin-already',
    question: 'What if someone is already checked in?',
    answer: 'If an attendee is already checked in, you\'ll see a green checkmark next to their name and the check-in time. You can still reprint their badge if needed by clicking the print button. If they need to be checked in again (e.g., for a different day), contact your admin.',
    category: 'check-in',
    keywords: ['already', 'duplicate', 'again', 'recheck', 'double'],
    relatedArticles: ['print-reprint']
  },

  // Printing Category
  {
    id: 'print-badge',
    question: 'How do I print a badge?',
    answer: 'After checking in an attendee, click the "Print Badge" button. If print preview is enabled, you\'ll see a preview first. The badge will be sent to your configured printer. Make sure you have a printer selected in the Printer settings (click the printer icon in the top bar).',
    category: 'printing',
    keywords: ['print', 'badge', 'label', 'name tag'],
    relatedArticles: ['print-setup', 'print-reprint']
  },
  {
    id: 'print-setup',
    question: 'How do I set up or change my printer?',
    answer: 'Click the Printer icon in the top header bar. You\'ll see available printers for your location. Select the printer you want to use. For Zebra printers, you may need to enter the printer\'s IP address. Click "Test Connection" to verify it\'s working before printing badges.',
    category: 'printing',
    keywords: ['printer', 'setup', 'configure', 'change', 'select', 'zebra', 'ip address'],
    relatedArticles: ['print-badge', 'print-not-working']
  },
  {
    id: 'print-reprint',
    question: 'How do I reprint a badge?',
    answer: 'Find the attendee (they should already be checked in). Click on their name to view details, then click the "Print Badge" button. You can reprint badges as many times as needed. The badge printed status will update each time.',
    category: 'printing',
    keywords: ['reprint', 'again', 'another', 'lost', 'damaged', 'new badge'],
    relatedArticles: ['print-badge']
  },
  {
    id: 'print-not-working',
    question: 'Why isn\'t my printer working?',
    answer: 'Common printer issues: 1) Check the printer is turned on and connected to the network. 2) Verify the correct printer is selected in settings. 3) For network printers, ensure you\'re on the same WiFi network. 4) Try the "Test Connection" button. 5) Check if the printer has paper/labels loaded. If problems persist, contact your event admin.',
    category: 'troubleshooting',
    keywords: ['not working', 'error', 'problem', 'failed', 'stuck', 'offline'],
    relatedArticles: ['print-setup']
  },

  // Scanning Category
  {
    id: 'scanning-qr',
    question: 'How do I scan a QR code?',
    answer: 'Go to the "QR Scanner" tab. Allow camera access when prompted. Point your device\'s camera at the attendee\'s QR code (from their confirmation email or ticket). The system will automatically recognize the code and show the attendee\'s information for check-in.',
    category: 'scanning',
    keywords: ['scan', 'qr', 'code', 'camera', 'barcode'],
    relatedArticles: ['checkin-how', 'scanning-not-working']
  },
  {
    id: 'scanning-not-working',
    question: 'The QR scanner isn\'t working. What should I do?',
    answer: 'Try these steps: 1) Make sure you\'ve allowed camera permissions in your browser. 2) Ensure good lighting - avoid glare on the screen. 3) Hold the camera steady about 6-8 inches from the code. 4) If the code is damaged, search for the attendee by name instead. 5) Try refreshing the page if the camera freezes.',
    category: 'troubleshooting',
    keywords: ['scanner', 'camera', 'not working', 'can\'t scan', 'permission'],
    relatedArticles: ['scanning-qr']
  },

  // Attendee Category
  {
    id: 'attendee-search',
    question: 'How do I find an attendee?',
    answer: 'Use the search bar at the top of the attendee list. You can search by first name, last name, email, or company. The list will filter as you type. You can also scroll through the full list or use the checked-in/not checked-in filters.',
    category: 'attendees',
    keywords: ['search', 'find', 'lookup', 'locate', 'name'],
    relatedArticles: ['checkin-how']
  },
  {
    id: 'attendee-not-found',
    question: 'What if I can\'t find an attendee in the list?',
    answer: 'If an attendee isn\'t in your list: 1) Double-check the spelling of their name. 2) Try searching by email or company. 3) They may be registered under a different name. 4) They may not be registered for this event - contact your admin to verify registration or add them manually if allowed.',
    category: 'attendees',
    keywords: ['not found', 'missing', 'can\'t find', 'doesn\'t exist', 'not registered'],
    relatedArticles: ['attendee-search']
  },
  {
    id: 'attendee-wrong-info',
    question: 'The attendee\'s information is wrong. Can I fix it?',
    answer: 'As staff, you can view attendee information but cannot edit registration details. If information needs to be corrected, contact your event admin. They can update the attendee\'s details in the admin portal, and the changes will sync to your check-in station.',
    category: 'attendees',
    keywords: ['wrong', 'incorrect', 'edit', 'change', 'update', 'fix', 'typo'],
    relatedArticles: ['attendee-search']
  },

  // Badge Templates - Staff perspective
  {
    id: 'badge-template-selection',
    question: 'How do I select which badge template to use?',
    answer: 'Badge templates are configured by your event admin in the Event Settings under "Badge Setup". The correct template is automatically selected based on each attendee\'s attendee type (e.g., VIP, Speaker, General). If you\'re seeing the wrong template, contact your admin to check the badge template assignments.',
    category: 'printing',
    keywords: ['template', 'badge', 'design', 'select', 'choose', 'type', 'participant'],
    relatedArticles: ['print-badge']
  },
  {
    id: 'badge-wrong-design',
    question: 'Why does the badge look different than expected?',
    answer: 'Badge designs are linked to attendee types. Each type (VIP, Speaker, Staff, etc.) can have its own template. If a badge looks wrong: 1) Check the attendee\'s attendee type is correct. 2) Contact your admin to verify the template assignment. You cannot change badge templates from the staff check-in screen.',
    category: 'troubleshooting',
    keywords: ['wrong', 'different', 'design', 'template', 'looks', 'badge'],
    relatedArticles: ['badge-template-selection']
  },

  // General Category
  {
    id: 'general-refresh',
    question: 'How do I refresh the attendee list?',
    answer: 'Click the refresh button (circular arrow icon) near the top of the page. This will fetch the latest attendee list from the server. The list auto-refreshes periodically, but manual refresh ensures you have the most current data, especially after new registrations.',
    category: 'general',
    keywords: ['refresh', 'reload', 'update', 'sync', 'new registrations'],
    relatedArticles: ['attendee-search']
  },
  {
    id: 'general-logout',
    question: 'How do I log out or switch events?',
    answer: 'Click the menu icon or your name in the top corner, then select "Log Out" or "Switch Event". Logging out will end your session and return you to the login screen. You\'ll need your staff credentials to log back in.',
    category: 'general',
    keywords: ['logout', 'log out', 'sign out', 'switch', 'change event', 'exit'],
    relatedArticles: []
  },
  {
    id: 'general-offline',
    question: 'Can I check in attendees without internet?',
    answer: 'The system has limited offline capability. If you lose connection, previously loaded attendees can still be checked in and the data will sync when you\'re back online. However, new registrations won\'t appear until you reconnect. Badge printing may also be affected if using cloud printing.',
    category: 'general',
    keywords: ['offline', 'no internet', 'connection', 'wifi', 'network'],
    relatedArticles: ['print-not-working']
  },
  {
    id: 'general-stats',
    question: 'Where can I see check-in statistics?',
    answer: 'Check-in statistics are shown at the top of the staff dashboard, including total attendees, how many are checked in, and the percentage. For detailed reports and analytics, your event admin can access comprehensive statistics in the admin portal.',
    category: 'general',
    keywords: ['stats', 'statistics', 'numbers', 'count', 'how many', 'total'],
    relatedArticles: []
  },

  // Troubleshooting
  {
    id: 'trouble-slow',
    question: 'The app is running slowly. What can I do?',
    answer: 'Try these steps: 1) Refresh the page. 2) Close other browser tabs. 3) Check your internet connection. 4) Clear your browser cache. 5) If on a shared network, bandwidth may be limited during peak times. 6) Contact your admin if the problem persists.',
    category: 'troubleshooting',
    keywords: ['slow', 'laggy', 'frozen', 'stuck', 'loading', 'performance'],
    relatedArticles: ['general-refresh']
  },
  {
    id: 'trouble-session',
    question: 'I got logged out unexpectedly. Why?',
    answer: 'Staff sessions expire for security after a period of inactivity or at a set time. If you were logged out: 1) Simply log back in with your credentials. 2) Check if your admin has set session time limits. 3) Your browser may have cleared cookies. This is normal security behavior.',
    category: 'troubleshooting',
    keywords: ['logged out', 'session', 'expired', 'kicked out', 'login again'],
    relatedArticles: ['general-logout']
  }
];

export const helpCategories = [
  { id: 'all', label: 'All Topics', icon: 'help-circle' },
  { id: 'check-in', label: 'Check-In', icon: 'user-check' },
  { id: 'printing', label: 'Printing', icon: 'printer' },
  { id: 'scanning', label: 'QR Scanning', icon: 'scan' },
  { id: 'attendees', label: 'Attendees', icon: 'users' },
  { id: 'general', label: 'General', icon: 'info' },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: 'alert-triangle' },
] as const;

export function searchHelpArticles(query: string, category?: string): HelpArticle[] {
  const normalizedQuery = query.toLowerCase().trim();
  
  let articles = staffHelpKnowledgeBase;
  
  if (category && category !== 'all') {
    articles = articles.filter(a => a.category === category);
  }
  
  if (!normalizedQuery) {
    return articles;
  }
  
  const scored = articles.map(article => {
    let score = 0;
    
    if (article.question.toLowerCase().includes(normalizedQuery)) {
      score += 10;
    }
    
    if (article.answer.toLowerCase().includes(normalizedQuery)) {
      score += 5;
    }
    
    const keywordMatch = article.keywords.some(k => 
      k.toLowerCase().includes(normalizedQuery) || 
      normalizedQuery.includes(k.toLowerCase())
    );
    if (keywordMatch) {
      score += 8;
    }
    
    const words = normalizedQuery.split(/\s+/);
    words.forEach(word => {
      if (word.length > 2) {
        if (article.question.toLowerCase().includes(word)) score += 2;
        if (article.keywords.some(k => k.toLowerCase().includes(word))) score += 3;
      }
    });
    
    return { article, score };
  });
  
  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.article);
}

export function getArticleById(id: string): HelpArticle | undefined {
  return staffHelpKnowledgeBase.find(a => a.id === id);
}

export function getRelatedArticles(articleId: string): HelpArticle[] {
  const article = getArticleById(articleId);
  if (!article?.relatedArticles) return [];
  
  return article.relatedArticles
    .map(id => getArticleById(id))
    .filter((a): a is HelpArticle => a !== undefined);
}
