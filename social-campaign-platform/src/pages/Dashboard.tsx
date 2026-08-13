import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Target, 
  TrendingUp, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  ArrowRight,
  Calendar,
  MessageSquare,
  Users
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { mockCampaigns, mockWorkPackages, mockSocialMediaPosts, mockDashboardStats } from '../mock-data';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const stats = mockDashboardStats;

  const statCards = [
    {
      title: 'Aktive Kampagnen',
      value: stats.activeCampaigns,
      total: `/ ${stats.totalCampaigns}`,
      icon: <Target className="h-8 w-8 text-blue-500" />,
      color: 'bg-blue-500/10 border-blue-500/20',
    },
    {
      title: 'Offene Aufgaben',
      value: stats.totalTasks,
      icon: <CheckCircle className="h-8 w-8 text-green-500" />,
      color: 'bg-green-500/10 border-green-500/20',
    },
    {
      title: 'Social Posts',
      value: stats.totalPosts,
      icon: <MessageSquare className="h-8 w-8 text-purple-500" />,
      color: 'bg-purple-500/10 border-purple-500/20',
    },
    {
      title: 'Gesamt Engagement',
      value: `${stats.totalEngagement}%`,
      icon: <TrendingUp className="h-8 w-8 text-red-500" />,
      color: 'bg-red-500/10 border-red-500/20',
    },
  ];

  const tasksByStatus = [
    { status: 'in_progress', label: 'In Arbeit', count: stats.tasksByStatus.in_progress, color: 'text-yellow-500' },
    { status: 'planned', label: 'Geplant', count: stats.tasksByStatus.planned, color: 'text-blue-500' },
    { status: 'blocker', label: 'Blockiert', count: stats.tasksByStatus.blocker, color: 'text-red-500' },
    { status: 'finished', label: 'Erledigt', count: stats.tasksByStatus.finished, color: 'text-green-500' },
  ];

  const recentPosts = mockSocialMediaPosts.slice(0, 3);
  const upcomingTasks = mockWorkPackages.filter(wp => wp.status !== 'finished').slice(0, 5);

  return (
    <div className="p-6 md:p-8 md:ml-64">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Willkommen zurück, {user?.name}!
          </h1>
          <p className="text-gray-400">Hier ist der Überblick über deine Kampagnen und Aufgaben.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, index) => (
            <div
              key={index}
              className={`p-6 rounded-xl border ${stat.color} backdrop-blur-sm`}
            >
              <div className="flex items-center justify-between mb-4">
                {stat.icon}
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <div className="text-3xl font-bold text-white">
                {stat.value}
                <span className="text-lg text-gray-400 ml-1">{stat.total}</span>
              </div>
              <p className="text-gray-400 mt-1">{stat.title}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Tasks by Status */}
          <div className="lg:col-span-1 bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
              <CheckCircle className="h-5 w-5 mr-2 text-blue-500" />
              Aufgaben Status
            </h2>
            <div className="space-y-4">
              {tasksByStatus.map((task) => (
                <div key={task.status} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${task.color.replace('text', 'bg')} mr-3`} />
                    <span className="text-gray-300">{task.label}</span>
                  </div>
                  <span className={`text-lg font-semibold ${task.color}`}>{task.count}</span>
                </div>
              ))}
            </div>
            <Link
              to="/tasks"
              className="mt-6 block text-center text-blue-400 hover:text-blue-300 transition-colors"
            >
              Alle Aufgaben ansehen →
            </Link>
          </div>

          {/* Upcoming Deadlines */}
          <div className="lg:col-span-2 bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
              <Clock className="h-5 w-5 mr-2 text-yellow-500" />
              Anstehende Deadlines
            </h2>
            <div className="space-y-3">
              {upcomingTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <div className="flex-1">
                    <h3 className="text-white font-medium">{task.title}</h3>
                    <p className="text-sm text-gray-400">{task.description}</p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      task.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                      task.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                      task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {task.priority}
                    </span>
                    {task.dueDate && (
                      <span className="text-sm text-gray-400">
                        {format(new Date(task.dueDate), 'dd.MM.yyyy', { locale: de })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Link
              to="/campaigns"
              className="mt-6 block text-center text-blue-400 hover:text-blue-300 transition-colors"
            >
              Zu den Kampagnen →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Campaigns */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
              <Target className="h-5 w-5 mr-2 text-green-500" />
              Aktuelle Kampagnen
            </h2>
            <div className="space-y-4">
              {mockCampaigns.slice(0, 3).map((campaign) => (
                <div
                  key={campaign.id}
                  className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-white font-semibold">{campaign.name}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      campaign.status === 'active' ? 'bg-green-500/20 text-green-400' :
                      campaign.status === 'planning' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {campaign.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">{campaign.description}</p>
                  <div className="flex items-center text-xs text-gray-500">
                    <Calendar className="h-3 w-3 mr-1" />
                    {format(new Date(campaign.startDate), 'dd.MM.yyyy', { locale: de })} - 
                    {format(new Date(campaign.endDate), 'dd.MM.yyyy', { locale: de })}
                  </div>
                </div>
              ))}
            </div>
            <Link
              to="/campaigns"
              className="mt-6 block text-center text-blue-400 hover:text-blue-300 transition-colors"
            >
              Alle Kampagnen anzeigen →
            </Link>
          </div>

          {/* Recent Social Posts */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-purple-500" />
              Letzte Social Posts
            </h2>
            <div className="space-y-4">
              {recentPosts.map((post) => (
                <div
                  key={post.id}
                  className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-blue-400">{post.platform}</span>
                    <span className="text-xs text-gray-500">
                      {format(new Date(post.postedAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 mb-3 line-clamp-2">{post.content}</p>
                  <div className="flex items-center space-x-4 text-xs text-gray-400">
                    <span className="flex items-center">
                      ❤️ {post.likes}
                    </span>
                    <span className="flex items-center">
                      💬 {post.comments}
                    </span>
                    <span className="flex items-center">
                      🔄 {post.shares}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Link
              to="/social-stream"
              className="mt-6 block text-center text-blue-400 hover:text-blue-300 transition-colors"
            >
              Zum Social Stream →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
