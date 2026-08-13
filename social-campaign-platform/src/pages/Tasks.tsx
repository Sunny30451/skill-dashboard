import React from 'react';
import { FileText, CheckCircle, Clock, AlertCircle, User, Bot } from 'lucide-react';
import { mockWorkPackages, mockUsers, mockAgents } from '../mock-data';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const Tasks: React.FC = () => {
  const [filterStatus, setFilterStatus] = React.useState<string>('all');

  const filteredTasks = filterStatus === 'all'
    ? mockWorkPackages
    : mockWorkPackages.filter(task => task.status === filterStatus);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'finished': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in_progress': return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'blocker': return <AlertCircle className="h-5 w-5 text-red-500" />;
      default: return <FileText className="h-5 w-5 text-blue-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      finished: 'bg-green-500/20 text-green-400',
      in_progress: 'bg-yellow-500/20 text-yellow-400',
      blocker: 'bg-red-500/20 text-red-400',
      planned: 'bg-blue-500/20 text-blue-400',
    };
    return badges[status] || 'bg-gray-500/20 text-gray-400';
  };

  const getPriorityBadge = (priority: string) => {
    const badges: Record<string, string> = {
      critical: 'bg-red-500/20 text-red-400',
      high: 'bg-orange-500/20 text-orange-400',
      medium: 'bg-yellow-500/20 text-yellow-400',
      low: 'bg-blue-500/20 text-blue-400',
    };
    return badges[priority] || 'bg-gray-500/20 text-gray-400';
  };

  const getAssignee = (assigneeId?: string, assigneeType?: string) => {
    if (assigneeType === 'agent') {
      const agent = mockAgents.find(a => a.id === assigneeId);
      return agent ? { name: agent.name, avatar: null, isAgent: true } : null;
    }
    const user = mockUsers.find(u => u.id === assigneeId);
    return user ? { name: user.name, avatar: user.avatar, isAgent: false } : null;
  };

  return (
    <div className="p-6 md:p-8 md:ml-64">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Aufgaben</h1>
            <p className="text-gray-400">Verwalte alle Arbeitspakete und Aufgaben</p>
          </div>
          <button className="mt-4 md:mt-0 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            Neue Aufgabe
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-8">
          {['all', 'planned', 'in_progress', 'blocker', 'finished'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filterStatus === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {status === 'all' ? 'Alle' : status.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Task Board */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Status</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Aufgabe</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Zugewiesen an</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Priorität</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Fällig am</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Stunden</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const assignee = getAssignee(task.assigneeId, task.assigneeType);
                  
                  return (
                    <tr
                      key={task.id}
                      className="border-b border-gray-700/50 hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          {getStatusIcon(task.status)}
                          <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${getStatusBadge(task.status)}`}>
                            {task.status.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <h3 className="text-white font-medium">{task.title}</h3>
                          <p className="text-sm text-gray-400 mt-1 line-clamp-1">{task.description}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {assignee ? (
                          <div className="flex items-center">
                            {assignee.isAgent ? (
                              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center mr-2">
                                <Bot className="h-4 w-4 text-purple-400" />
                              </div>
                            ) : (
                              <img
                                src={assignee.avatar || 'https://i.pravatar.cc/150'}
                                alt={assignee.name}
                                className="w-8 h-8 rounded-full mr-2"
                              />
                            )}
                            <div>
                              <p className="text-white text-sm">{assignee.name}</p>
                              <p className="text-xs text-gray-400">{assignee.isAgent ? 'Agent' : 'User'}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-sm">Nicht zugewiesen</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityBadge(task.priority)}`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {task.dueDate ? (
                          <span className="text-gray-300 text-sm">
                            {format(new Date(task.dueDate), 'dd.MM.yyyy', { locale: de })}
                          </span>
                        ) : (
                          <span className="text-gray-500 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-gray-300 text-sm">
                          {task.actualHours || 0} / {task.estimatedHours || 0}h
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
            <div className="text-2xl font-bold text-blue-400">
              {mockWorkPackages.filter(t => t.status === 'planned').length}
            </div>
            <div className="text-sm text-gray-400">Geplant</div>
          </div>
          <div className="bg-yellow-500/10 rounded-lg p-4 border border-yellow-500/20">
            <div className="text-2xl font-bold text-yellow-400">
              {mockWorkPackages.filter(t => t.status === 'in_progress').length}
            </div>
            <div className="text-sm text-gray-400">In Arbeit</div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/20">
            <div className="text-2xl font-bold text-red-400">
              {mockWorkPackages.filter(t => t.status === 'blocker').length}
            </div>
            <div className="text-sm text-gray-400">Blockiert</div>
          </div>
          <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/20">
            <div className="text-2xl font-bold text-green-400">
              {mockWorkPackages.filter(t => t.status === 'finished').length}
            </div>
            <div className="text-sm text-gray-400">Erledigt</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tasks;
