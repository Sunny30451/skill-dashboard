import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Target, Users, Bot, TrendingUp, Calendar, MessageSquare, ArrowRight, CheckCircle, Github, Twitter, Linkedin } from 'lucide-react';
import { UserRole } from '../types';
import { useAuth } from '../contexts/AuthContext';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [registerData, setRegisterData] = useState({
    email: '',
    name: '',
    role: 'Worker' as UserRole,
  });

  const features = [
    {
      icon: <Target className="h-8 w-8 text-blue-500" />,
      title: 'Kampagnen-Management',
      description: 'Verwalte mehrere Kampagnen mit Phasen, Meilensteinen und Arbeitspaketen',
    },
    {
      icon: <Users className="h-8 w-8 text-green-500" />,
      title: 'Team-Kollaboration',
      description: 'Arbeite mit verschiedenen Rollen zusammen: Admin, Worker, Visitor, Agent',
    },
    {
      icon: <Bot className="h-8 w-8 text-purple-500" />,
      title: 'AI-Agent Workflows',
      description: 'Automatisiere Prozesse mit KI-gestützten Agenten und Workflows',
    },
    {
      icon: <TrendingUp className="h-8 w-8 text-red-500" />,
      title: 'Social Media Stream',
      description: 'Echtzeit-Überblick über alle deine Social-Media-Aktivitäten',
    },
    {
      icon: <Calendar className="h-8 w-8 text-yellow-500" />,
      title: 'Zeitplanung',
      description: 'Terminiere Phasen und verfolge Deadlines im Überblick',
    },
    {
      icon: <MessageSquare className="h-8 w-8 text-indigo-500" />,
      title: 'Live-Chat',
      description: 'Kommuniziere in Echtzeit mit deinem Team und AI-Assistenten',
    },
  ];

  const blogPosts = [
    {
      title: 'Best Practices für Social-Media-Kampagnen 2025',
      excerpt: 'Entdecke die effektivsten Strategien für erfolgreiche Kampagnen...',
      date: '15. März 2025',
      author: 'Marketing Team',
    },
    {
      title: 'AI-Agenten im Marketing: Ein Leitfaden',
      excerpt: 'Wie künstliche Intelligenz deine Workflows revolutionieren kann...',
      date: '10. März 2025',
      author: 'Tech Team',
    },
    {
      title: 'Case Study: Produktlaunch mit 300% mehr Engagement',
      excerpt: 'Erfahre wie wir mit unserer Plattform beeindruckende Ergebnisse erzielt haben...',
      date: '5. März 2025',
      author: 'Success Team',
    },
  ];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(loginEmail);
    if (success) {
      navigate('/dashboard');
    } else {
      alert('Login failed. Try: admin@example.com, worker@example.com, visitor@example.com, agent@example.com');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await register(registerData.email, registerData.name, registerData.role);
    if (success) {
      navigate('/dashboard');
    } else {
      alert('Registration failed. Email might already exist.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-2">
              <Target className="h-8 w-8 text-blue-500" />
              <span className="text-xl font-bold text-white">CampaignHub</span>
            </div>
            
            <nav className="hidden md:flex items-center space-x-8">
              <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
              <a href="#blog" className="text-gray-300 hover:text-white transition-colors">Blog</a>
              <a href="#challenge" className="text-gray-300 hover:text-white transition-colors">Challenge</a>
              <button
                onClick={() => setShowLogin(true)}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Login
              </button>
              <button
                onClick={() => setShowRegister(true)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Registrieren
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
            All-in-One Plattform für
            <span className="text-blue-500"> Social-Media Kampagnen</span>
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-10">
            Verwalte, plane und optimiere deine Social-Media-Kampagnen mit einer modularen, 
            KI-gestützten Plattform. Von der Planung bis zur Ausführung - alles an einem Ort.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => setShowRegister(true)}
              className="px-8 py-4 bg-blue-600 text-white text-lg rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
            >
              Jetzt starten
              <ArrowRight className="ml-2 h-5 w-5" />
            </button>
            <a
              href="#challenge"
              className="px-8 py-4 border border-gray-600 text-gray-300 text-lg rounded-lg hover:border-gray-400 hover:text-white transition-colors"
            >
              Mehr erfahren
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-gray-800/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-white text-center mb-4">
            Alles was du brauchst
          </h2>
          <p className="text-gray-400 text-center mb-16 max-w-2xl mx-auto">
            Eine vollständige Suite von Tools für erfolgreiches Social-Media-Management
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="p-6 bg-gray-800 rounded-xl border border-gray-700 hover:border-blue-500 transition-colors"
              >
                <div className="mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Challenge Section */}
      <section id="challenge" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 md:p-12">
            <div className="md:flex md:items-center md:justify-between">
              <div className="md:w-2/3">
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                  Die Challenge
                </h2>
                <p className="text-blue-100 text-lg mb-6">
                  Wir entwickeln eine innovative Plattform, die es Teams ermöglicht, 
                  Social-Media-Kampagnen effizienter zu planen, durchzuführen und zu analysieren. 
                  Mit integrierter KI-Unterstützung und automatisierten Workflows setzen wir neue Maßstäbe.
                </p>
                <ul className="space-y-3">
                  {[
                    'Modulare Architektur für einfache Erweiterbarkeit',
                    'Multi-Tenancy-fähig für zukünftiges Wachstum',
                    'OAuth-Integration vorbereitet',
                    'Agent-basierte Workflow-Automatisierung',
                    'Echtzeit-Collaboration Features',
                  ].map((item, i) => (
                    <li key={i} className="flex items-center text-blue-100">
                      <CheckCircle className="h-5 w-5 mr-3 text-green-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="md:w-1/3 mt-8 md:mt-0 text-center">
                <div className="text-6xl font-bold text-white mb-2">100%</div>
                <p className="text-blue-200">Open API Ready</p>
                <div className="text-6xl font-bold text-white mt-6 mb-2">4+</div>
                <p className="text-blue-200">Rollen-System</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Blog Section */}
      <section id="blog" className="py-20 px-4 bg-gray-800/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-white text-center mb-4">
            Journal & Insights
          </h2>
          <p className="text-gray-400 text-center mb-16 max-w-2xl mx-auto">
            Aktuelle Artikel, Tipps und Best Practices aus der Welt des Social-Media-Marketings
          </p>
          
          <div className="grid md:grid-cols-3 gap-8">
            {blogPosts.map((post, index) => (
              <article
                key={index}
                className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 hover:border-blue-500 transition-colors"
              >
                <div className="h-48 bg-gradient-to-br from-blue-600 to-purple-600" />
                <div className="p-6">
                  <p className="text-sm text-blue-400 mb-2">{post.date}</p>
                  <h3 className="text-xl font-semibold text-white mb-3">{post.title}</h3>
                  <p className="text-gray-400 mb-4">{post.excerpt}</p>
                  <p className="text-sm text-gray-500">von {post.author}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Bereit loszulegen?
          </h2>
          <p className="text-xl text-gray-300 mb-10">
            Starte noch heute mit deiner ersten Kampagne
          </p>
          <button
            onClick={() => setShowRegister(true)}
            className="px-8 py-4 bg-blue-600 text-white text-lg rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center"
          >
            Kostenlos registrieren
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Target className="h-6 w-6 text-blue-500" />
                <span className="text-lg font-bold text-white">CampaignHub</span>
              </div>
              <p className="text-gray-400 text-sm">
                Die All-in-One Plattform für erfolgreiches Social-Media-Management.
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Produkt</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Preise</a></li>
                <li><a href="#" className="hover:text-white transition-colors">API</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Ressourcen</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#blog" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Dokumentation</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Connect</h4>
              <div className="flex space-x-4">
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <Github className="h-5 w-5" />
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <Twitter className="h-5 w-5" />
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <Linkedin className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
          
          <div className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
            © 2025 CampaignHub. Alle Rechte vorbehalten.
          </div>
        </div>
      </footer>

      {/* Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full relative">
            <button
              onClick={() => setShowLogin(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              ✕
            </button>
            <h2 className="text-2xl font-bold text-white mb-6">Login</h2>
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className="block text-gray-400 text-sm mb-2">E-Mail</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Einloggen
              </button>
            </form>
            <div className="mt-6 pt-6 border-t border-gray-700">
              <p className="text-gray-400 text-sm mb-3">Demo Accounts:</p>
              <div className="space-y-1 text-xs text-gray-500">
                <p>admin@example.com (Admin)</p>
                <p>worker@example.com (Worker)</p>
                <p>visitor@example.com (Visitor)</p>
                <p>agent@example.com (Agent)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Register Modal */}
      {showRegister && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full relative">
            <button
              onClick={() => setShowRegister(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              ✕
            </button>
            <h2 className="text-2xl font-bold text-white mb-6">Registrieren</h2>
            <form onSubmit={handleRegister}>
              <div className="mb-4">
                <label className="block text-gray-400 text-sm mb-2">Name</label>
                <input
                  type="text"
                  value={registerData.name}
                  onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="Dein Name"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-400 text-sm mb-2">E-Mail</label>
                <input
                  type="email"
                  value={registerData.email}
                  onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="deine@email.com"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-gray-400 text-sm mb-2">Rolle</label>
                <select
                  value={registerData.role}
                  onChange={(e) => setRegisterData({ ...registerData, role: e.target.value as UserRole })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Worker">Worker</option>
                  <option value="Visitor">Visitor</option>
                  <option value="Agent">Agent</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Konto erstellen
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;
