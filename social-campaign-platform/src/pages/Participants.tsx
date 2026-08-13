import React from 'react';
import { Users, User, Bot } from 'lucide-react';
import { mockParticipants } from '../mock-data';

const Participants: React.FC = () => {
  return (
    <div className="p-6 md:p-8 md:ml-64">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Beteiligte</h1>
            <p className="text-gray-400">Alle Personen und Agenten in deinen Kampagnen</p>
          </div>
          <button className="mt-4 md:mt-0 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Teilnehmer einladen
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <Users className="h-8 w-8 text-blue-500" />
              <span className="text-3xl font-bold text-white">
                {mockParticipants.filter(p => p.userId).length}
              </span>
            </div>
            <p className="text-gray-400">Menschliche Teilnehmer</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <Bot className="h-8 w-8 text-purple-500" />
              <span className="text-3xl font-bold text-white">
                {mockParticipants.filter(p => p.agentId).length}
              </span>
            </div>
            <p className="text-gray-400">KI-Agenten</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <User className="h-8 w-8 text-green-500" />
              <span className="text-3xl font-bold text-white">{mockParticipants.length}</span>
            </div>
            <p className="text-gray-400">Gesamt</p>
          </div>
        </div>

        {/* Participants List */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Name</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Rolle</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Typ</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Kampagnen</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {mockParticipants.map((participant) => (
                <tr key={participant.id} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      {participant.userId ? (
                        <img
                          src={participant.avatar || 'https://i.pravatar.cc/150'}
                          alt={participant.name}
                          className="w-10 h-10 rounded-full mr-3"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center mr-3">
                          <Bot className="h-5 w-5 text-purple-400" />
                        </div>
                      )}
                      <div>
                        <p className="text-white font-medium">{participant.name}</p>
                        {participant.email && (
                          <p className="text-xs text-gray-400">{participant.email}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-300">{participant.role}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      participant.userId
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-purple-500/20 text-purple-400'
                    }`}>
                      {participant.userId ? 'Mensch' : 'Agent'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      {participant.campaignIds.map((cid, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs"
                        >
                          C{i + 1}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-medium">
                      Aktiv
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Participants;
