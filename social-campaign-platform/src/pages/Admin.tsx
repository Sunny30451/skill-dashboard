import React, { useState } from 'react';
import { Settings, Users, Database, Bot, Key, Globe, Save } from 'lucide-react';
import { mockSocialMediaAccounts, mockUsers } from '../mock-data';

const Admin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'accounts' | 'users' | 'settings'>('accounts');

  return (
    <div className="p-6 md:p-8 md:ml-64">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Admin-Bereich</h1>
          <p className="text-gray-400">Systemverwaltung und Einstellungen</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-gray-700">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`px-6 py-3 flex items-center ${
              activeTab === 'accounts'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Globe className="h-5 w-5 mr-2" />
            Social Media Konten
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-3 flex items-center ${
              activeTab === 'users'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Users className="h-5 w-5 mr-2" />
            Benutzer
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-6 py-3 flex items-center ${
              activeTab === 'settings'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Settings className="h-5 w-5 mr-2" />
            Systemeinstellungen
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'accounts' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">Social Media Accounts</h3>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Account hinzufügen
              </button>
            </div>

            <div className="space-y-4">
              {mockSocialMediaAccounts.map((account) => (
                <div
                  key={account.id}
                  className="bg-gray-800/50 rounded-xl border border-gray-700 p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center">
                      <div className={`p-3 rounded-lg ${
                        account.isActive ? 'bg-blue-500/20' : 'bg-gray-700'
                      }`}>
                        <Globe className={`h-6 w-6 ${
                          account.isActive ? 'text-blue-400' : 'text-gray-400'
                        }`} />
                      </div>
                      <div className="ml-4">
                        <h4 className="text-white font-semibold">{account.name}</h4>
                        <p className="text-gray-400 text-sm">{account.platform}</p>
                        <p className="text-gray-500 text-xs mt-1">{account.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        account.isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {account.isActive ? 'Aktiv' : 'Inaktiv'}
                      </span>
                      <button className="p-2 text-gray-400 hover:text-white">
                        <Settings className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">URL</p>
                      <p className="text-sm text-gray-300 truncate">{account.url}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">API Endpoint</p>
                      <p className="text-sm text-gray-300 truncate font-mono">{account.apiEndpoint}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Kampagnen</p>
                      <p className="text-sm text-gray-300">{account.campaignIds.length} zugewiesen</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">Benutzerverwaltung</h3>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                Neuer Benutzer
              </button>
            </div>

            <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Name</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">E-Mail</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Rolle</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Kampagnen-Rolle</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {mockUsers.map((user) => (
                    <tr key={user.id} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <img
                            src={user.avatar || 'https://i.pravatar.cc/150'}
                            alt={user.name}
                            className="w-8 h-8 rounded-full mr-3"
                          />
                          <span className="text-white">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-300">{user.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          user.role === 'Admin' ? 'bg-red-500/20 text-red-400' :
                          user.role === 'Worker' ? 'bg-blue-500/20 text-blue-400' :
                          user.role === 'Agent' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-sm">{user.campaignRole || '-'}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button className="text-blue-400 hover:text-blue-300 text-sm">Bearbeiten</button>
                          <button className="text-red-400 hover:text-red-300 text-sm">Löschen</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* AI Settings */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                <Bot className="h-5 w-5 mr-2 text-purple-400" />
                KI-Einstellungen
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Provider</label>
                  <select className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500">
                    <option value="cloud">Cloud (OpenAI)</option>
                    <option value="local">Lokal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Modell</label>
                  <select className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500">
                    <option value="gpt-4">GPT-4</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="claude-3">Claude 3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">API Endpoint</label>
                  <input
                    type="text"
                    defaultValue="https://api.openai.com/v1"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">API Key</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="password"
                      defaultValue="sk-xxx..."
                      className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Workflow Settings */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
              <h3 className="text-xl font-semibold text-white mb-6 flex items-center">
                <Database className="h-5 w-5 mr-2 text-blue-400" />
                Agent Workflow Verwaltung
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                  <div>
                    <p className="text-white font-medium">Cronjob für Social-Media-Sync</p>
                    <p className="text-sm text-gray-400">Automatisches Abrufen von Posts aller verbundenen Accounts</p>
                  </div>
                  <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">Aktiv</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                  <div>
                    <p className="text-white font-medium">Workflow Execution Engine</p>
                    <p className="text-sm text-gray-400">Plattform für automatische Workflow-Ausführung</p>
                  </div>
                  <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">Aktiv</span>
                </div>
              </div>
            </div>

            <button className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center">
              <Save className="h-5 w-5 mr-2" />
              Einstellungen speichern
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;
