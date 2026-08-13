import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Target, Calendar, Users, ChevronRight, Plus, Filter, Search } from 'lucide-react';
import { mockCampaigns, mockPhases, mockMilestones, mockWorkPackages } from '../mock-data';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const Campaigns: React.FC = () => {
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredCampaigns = mockCampaigns.filter(campaign => {
    const matchesSearch = campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         campaign.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getCampaignPhases = (campaignId: string) => {
    return mockPhases.filter(p => p.campaignId === campaignId);
  };

  const getPhaseMilestones = (phaseId: string) => {
    return mockMilestones.filter(m => m.phaseId === phaseId);
  };

  const getMilestoneWorkPackages = (milestoneId: string) => {
    return mockWorkPackages.filter(wp => wp.milestoneId === milestoneId);
  };

  return (
    <div className="p-6 md:p-8 md:ml-64">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Kampagnen</h1>
            <p className="text-gray-400">Verwalte alle deine Social-Media-Kampagnen</p>
          </div>
          <button className="mt-4 md:mt-0 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center">
            <Plus className="h-5 w-5 mr-2" />
            Neue Kampagne
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Kampagnen suchen..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">Alle Status</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Campaign Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {filteredCampaigns.map((campaign) => {
            const phases = getCampaignPhases(campaign.id);
            const currentPhase = phases.find(p => p.status === 'current') || phases[0];

            return (
              <div
                key={campaign.id}
                className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden hover:border-blue-500 transition-colors"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center">
                      <div className="p-3 bg-blue-500/10 rounded-lg mr-4">
                        <Target className="h-6 w-6 text-blue-500" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-white">{campaign.name}</h2>
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium mt-1 ${
                          campaign.status === 'active' ? 'bg-green-500/20 text-green-400' :
                          campaign.status === 'planning' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {campaign.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-gray-400 mb-4">{campaign.description}</p>

                  <div className="flex items-center text-sm text-gray-500 mb-4">
                    <Calendar className="h-4 w-4 mr-2" />
                    {format(new Date(campaign.startDate), 'dd.MM.yyyy', { locale: de })} - 
                    {format(new Date(campaign.endDate), 'dd.MM.yyyy', { locale: de })}
                  </div>

                  {/* Current Phase */}
                  {currentPhase && (
                    <div className="bg-gray-800 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">Aktuelle Phase</span>
                        <span className="text-xs text-blue-400">{currentPhase.status}</span>
                      </div>
                      <h3 className="text-white font-medium mb-2">{currentPhase.name}</h3>
                      <p className="text-sm text-gray-400 mb-3">{currentPhase.description}</p>
                      
                      {/* Progress Bar */}
                      <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all"
                          style={{ width: `${Math.random() * 60 + 20}%` }}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{format(new Date(currentPhase.startDate), 'dd.MM', { locale: de })}</span>
                        <span>{format(new Date(currentPhase.endDate), 'dd.MM', { locale: de })}</span>
                      </div>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">{phases.length}</div>
                      <div className="text-xs text-gray-400">Phasen</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">
                        {phases.reduce((acc, phase) => acc + getPhaseMilestones(phase.id).length, 0)}
                      </div>
                      <div className="text-xs text-gray-400">Meilensteine</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">
                        {phases.reduce((acc, phase) => 
                          acc + getPhaseMilestones(phase.id).reduce((mAcc, m) => 
                            mAcc + getMilestoneWorkPackages(m.id).length, 0
                          ), 0)
                        }
                      </div>
                      <div className="text-xs text-gray-400">Aufgaben</div>
                    </div>
                  </div>

                  <Link
                    to={`/campaigns/${campaign.id}`}
                    className="flex items-center justify-center w-full px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Details ansehen
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* All Phases Overview */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-purple-500" />
            Alle Phasen im Überblick
          </h2>
          
          <div className="space-y-6">
            {mockPhases.map((phase, index) => (
              <div key={phase.id} className="relative">
                {/* Timeline line */}
                {index < mockPhases.length - 1 && (
                  <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-700" />
                )}
                
                <div className="flex items-start">
                  {/* Timeline dot */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mr-4 flex-shrink-0 ${
                    phase.status === 'completed' ? 'bg-green-500' :
                    phase.status === 'current' ? 'bg-blue-500' :
                    'bg-gray-700'
                  }`}>
                    {phase.status === 'completed' ? '✓' : index + 1}
                  </div>
                  
                  {/* Phase card */}
                  <div className="flex-1 bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white font-semibold">{phase.name}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        phase.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        phase.status === 'current' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {phase.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mb-3">{phase.description}</p>
                    
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                      <span>{format(new Date(phase.startDate), 'dd.MM.yyyy', { locale: de })}</span>
                      <span>{format(new Date(phase.endDate), 'dd.MM.yyyy', { locale: de })}</span>
                    </div>
                    
                    {/* Milestones */}
                    <div className="flex flex-wrap gap-2">
                      {getPhaseMilestones(phase.id).map((milestone) => (
                        <span
                          key={milestone.id}
                          className={`px-2 py-1 rounded text-xs ${
                            milestone.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                            milestone.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}
                        >
                          {milestone.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Campaigns;
