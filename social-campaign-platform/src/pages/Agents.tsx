import React from 'react';
import { Bot, Play, Pause, Settings, Zap, Clock, Activity } from 'lucide-react';
import { mockAgents, mockWorkflows } from '../mock-data';

const Agents: React.FC = () => {
  return (
    <div className="p-6 md:p-8 md:ml-64">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Agent Workflows</h1>
            <p className="text-gray-400">Verwalte KI-Agenten und automatisierte Workflows</p>
          </div>
          <button className="mt-4 md:mt-0 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center">
            <Bot className="h-5 w-5 mr-2" />
            Neuen Agent erstellen
          </button>
        </div>

        {/* AI Settings Card */}
        <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl border border-purple-500/20 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center">
              <Settings className="h-5 w-5 mr-2 text-purple-400" />
              KI-Einstellungen
            </h2>
            <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
              Aktiv
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-800/50 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-1">Provider</p>
              <p className="text-white font-medium">Cloud (OpenAI)</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-1">Modell</p>
              <p className="text-white font-medium">GPT-4</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-1">Status</p>
              <p className="text-green-400 font-medium">Verbunden</p>
            </div>
          </div>
        </div>

        {/* Agents Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Verfügbare Agenten</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mockAgents.map((agent) => (
              <div
                key={agent.id}
                className={`rounded-xl border p-6 ${
                  agent.isActive
                    ? 'bg-gray-800/50 border-purple-500/20'
                    : 'bg-gray-800/30 border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div className={`p-3 rounded-lg ${
                      agent.isActive ? 'bg-purple-500/20' : 'bg-gray-700'
                    }`}>
                      <Bot className={`h-6 w-6 ${
                        agent.isActive ? 'text-purple-400' : 'text-gray-400'
                      }`} />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-white font-semibold">{agent.name}</h3>
                      <p className="text-xs text-gray-400">{agent.type}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    agent.isActive
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {agent.isActive ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </div>

                <p className="text-gray-400 text-sm mb-4">{agent.description}</p>

                <div className="flex flex-wrap gap-1 mb-4">
                  {agent.capabilities.map((cap, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 bg-purple-500/10 text-purple-400 rounded text-xs"
                    >
                      {cap}
                    </span>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm">
                    Konfigurieren
                  </button>
                  <button className="px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors">
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Workflows Section */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">Workflows</h2>
          <div className="space-y-4">
            {mockWorkflows.map((workflow) => (
              <div
                key={workflow.id}
                className="bg-gray-800/50 rounded-xl border border-gray-700 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <div className={`p-3 rounded-lg ${
                      workflow.isActive ? 'bg-blue-500/20' : 'bg-gray-700'
                    }`}>
                      <Zap className={`h-6 w-6 ${
                        workflow.isActive ? 'text-blue-400' : 'text-gray-400'
                      }`} />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-white font-semibold text-lg">{workflow.name}</h3>
                      <p className="text-gray-400 text-sm">{workflow.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      workflow.isActive
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {workflow.isActive ? 'Aktiv' : 'Inaktiv'}
                    </span>
                    <button className="p-2 text-gray-400 hover:text-white">
                      <Settings className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Workflow Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="flex items-center text-sm">
                    <Activity className="h-4 w-4 text-blue-400 mr-2" />
                    <span className="text-gray-400">Typ:</span>
                    <span className="text-white ml-2 capitalize">{workflow.triggerType}</span>
                  </div>
                  {workflow.schedule && (
                    <div className="flex items-center text-sm">
                      <Clock className="h-4 w-4 text-yellow-400 mr-2" />
                      <span className="text-gray-400">Zeitplan:</span>
                      <span className="text-white ml-2 font-mono">{workflow.schedule}</span>
                    </div>
                  )}
                  <div className="flex items-center text-sm">
                    <Bot className="h-4 w-4 text-purple-400 mr-2" />
                    <span className="text-gray-400">Schritte:</span>
                    <span className="text-white ml-2">{workflow.steps.length}</span>
                  </div>
                </div>

                {/* Workflow Steps */}
                <div className="border-t border-gray-700 pt-4">
                  <p className="text-sm text-gray-400 mb-3">Workflow-Schritte:</p>
                  <div className="flex flex-wrap gap-2">
                    {workflow.steps.map((step, index) => (
                      <div
                        key={step.id}
                        className="flex items-center bg-gray-800 rounded-lg px-3 py-2"
                      >
                        <span className="text-xs text-gray-500 mr-2">{index + 1}.</span>
                        <span className="text-sm text-white">{step.action}</span>
                        {step.agentId && (
                          <Bot className="h-3 w-3 text-purple-400 ml-2" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <button className={`px-4 py-2 rounded-lg flex items-center ${
                    workflow.isActive
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                  }`}>
                    {workflow.isActive ? (
                      <>
                        <Pause className="h-4 w-4 mr-2" />
                        Deaktivieren
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Aktivieren
                      </>
                    )}
                  </button>
                  <button className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors">
                    Bearbeiten
                  </button>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    Jetzt ausführen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Agents;
