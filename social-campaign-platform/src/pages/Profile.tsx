import React, { useState } from 'react';
import { User, Mail, Lock, Key, Save, UserCircle, CreditCard, MessageSquare, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { mockCredentials, mockParticipants, mockChatMessages } from '../mock-data';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const Profile: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'credentials' | 'chat'>('profile');
  
  const userCredentials = mockCredentials.filter(c => c.userId === user?.id);
  const userParticipant = mockParticipants.find(p => p.userId === user?.id);
  const contacts = mockParticipants.filter(p => p.userId && p.userId !== user?.id);

  return (
    <div className="p-6 md:p-8 md:ml-64">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Persönlicher Bereich</h1>
          <p className="text-gray-400">Verwalte dein Profil, Credentials und Chat</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-gray-700">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-6 py-3 flex items-center ${
              activeTab === 'profile'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <UserCircle className="h-5 w-5 mr-2" />
            Profil
          </button>
          <button
            onClick={() => setActiveTab('credentials')}
            className={`px-6 py-3 flex items-center ${
              activeTab === 'credentials'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Key className="h-5 w-5 mr-2" />
            Credentials
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-6 py-3 flex items-center ${
              activeTab === 'chat'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <MessageSquare className="h-5 w-5 mr-2" />
            Live-Chat
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Card */}
            <div className="lg:col-span-1">
              <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6 text-center">
                <img
                  src={user?.avatar || 'https://i.pravatar.cc/150'}
                  alt={user?.name}
                  className="w-32 h-32 rounded-full mx-auto mb-4"
                />
                <h2 className="text-xl font-semibold text-white">{user?.name}</h2>
                <p className="text-gray-400 mb-2">{user?.email}</p>
                <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                  {user?.role}
                </span>
                {userParticipant && (
                  <p className="text-gray-500 text-sm mt-2">{userParticipant.role}</p>
                )}
              </div>
            </div>

            {/* Profile Form */}
            <div className="lg:col-span-2">
              <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
                <h3 className="text-xl font-semibold text-white mb-6">Profil bearbeiten</h3>
                <form className="space-y-4">
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        defaultValue={user?.name}
                        className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">E-Mail</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="email"
                        defaultValue={user?.email}
                        className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-gray-400 text-sm mb-2">Neues Passwort</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="password"
                        placeholder="Leer lassen um zu behalten"
                        className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                  >
                    <Save className="h-5 w-5 mr-2" />
                    Änderungen speichern
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'credentials' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">Gespeicherte Credentials</h3>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center">
                <CreditCard className="h-4 w-4 mr-2" />
                Neue Credentials
              </button>
            </div>
            
            <div className="space-y-4">
              {userCredentials.map((cred) => (
                <div
                  key={cred.id}
                  className="bg-gray-800/50 rounded-xl border border-gray-700 p-6"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-white font-semibold mb-1">{cred.service}</h4>
                      <p className="text-gray-400 text-sm mb-2">{cred.username}</p>
                      {cred.notes && (
                        <p className="text-gray-500 text-xs">{cred.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button className="p-2 text-gray-400 hover:text-white">
                        <User className="h-4 w-4" />
                      </button>
                      <button className="p-2 text-gray-400 hover:text-red-400">
                        <Lock className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-4">
                    Aktualisiert: {format(new Date(cred.updatedAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </p>
                </div>
              ))}
              
              {userCredentials.length === 0 && (
                <div className="text-center py-12">
                  <Key className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-400 mb-2">Keine Credentials</h3>
                  <p className="text-gray-500">Speichere deine ersten Zugangsdaten.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Contacts */}
            <div className="lg:col-span-1">
              <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-700">
                  <h3 className="text-white font-semibold flex items-center">
                    <Users className="h-5 w-5 mr-2" />
                    Kontakte ({contacts.length})
                  </h3>
                </div>
                <div className="divide-y divide-gray-700">
                  {contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="p-4 hover:bg-gray-700/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center">
                        <img
                          src={contact.avatar || 'https://i.pravatar.cc/150'}
                          alt={contact.name}
                          className="w-10 h-10 rounded-full mr-3"
                        />
                        <div>
                          <p className="text-white font-medium">{contact.name}</p>
                          <p className="text-xs text-gray-400">{contact.role}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Chat Area */}
            <div className="lg:col-span-2">
              <div className="bg-gray-800/50 rounded-xl border border-gray-700 flex flex-col h-[500px]">
                {/* Chat Header */}
                <div className="p-4 border-b border-gray-700">
                  <h3 className="text-white font-semibold">Team Chat</h3>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {mockChatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          msg.isSystem
                            ? 'bg-blue-600/20 border border-blue-500/20'
                            : msg.senderId === user?.id
                            ? 'bg-blue-600'
                            : 'bg-gray-700'
                        }`}
                      >
                        {!msg.isSystem && msg.senderId !== user?.id && (
                          <p className="text-xs text-gray-400 mb-1">{msg.senderName}</p>
                        )}
                        <p className="text-white text-sm">{msg.content}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {format(new Date(msg.timestamp), 'HH:mm', { locale: de })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input */}
                <div className="p-4 border-t border-gray-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nachricht schreiben..."
                      className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    />
                    <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                      Senden
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
