import React from 'react';
import { 
  MessageSquare, 
  Heart, 
  Share2, 
  Comment, 
  TrendingUp, 
  Instagram, 
  Twitter, 
  Linkedin, 
  Video,
  Image
} from 'lucide-react';
import { mockSocialMediaPosts, mockSocialMediaAccounts } from '../mock-data';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const SocialStream: React.FC = () => {
  const [selectedPlatform, setSelectedPlatform] = React.useState<string>('all');
  
  const filteredPosts = selectedPlatform === 'all' 
    ? mockSocialMediaPosts 
    : mockSocialMediaPosts.filter(post => post.platform.toLowerCase() === selectedPlatform.toLowerCase());

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'Instagram': return <Instagram className="h-4 w-4" />;
      case 'Twitter/X': return <Twitter className="h-4 w-4" />;
      case 'LinkedIn': return <Linkedin className="h-4 w-4" />;
      case 'TikTok': return <Video className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const platformColors: Record<string, string> = {
    'Instagram': 'text-pink-500',
    'Twitter/X': 'text-blue-400',
    'LinkedIn': 'text-blue-600',
    'TikTok': 'text-black dark:text-white',
    'Facebook': 'text-blue-600',
  };

  return (
    <div className="p-6 md:p-8 md:ml-64">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Social Media Stream</h1>
          <p className="text-gray-400">Chronologischer Verlauf aller deiner Social-Media-Posts</p>
        </div>

        {/* Platform Filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setSelectedPlatform('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              selectedPlatform === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Alle
          </button>
          {mockSocialMediaAccounts.map((account) => (
            <button
              key={account.id}
              onClick={() => setSelectedPlatform(account.platform)}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center ${
                selectedPlatform === account.platform
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {getPlatformIcon(account.platform)}
              <span className="ml-2">{account.platform}</span>
            </button>
          ))}
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-white">{filteredPosts.length}</div>
            <div className="text-sm text-gray-400">Posts angezeigt</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-white">
              {filteredPosts.reduce((acc, post) => acc + (post.likes || 0), 0).toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">Gesamt Likes</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-white">
              {filteredPosts.reduce((acc, post) => acc + (post.comments || 0), 0).toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">Gesamt Kommentare</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-white">
              {filteredPosts.reduce((acc, post) => acc + (post.shares || 0), 0).toLocaleString()}
            </div>
            <div className="text-sm text-gray-400">Gesamt Shares</div>
          </div>
        </div>

        {/* Posts Timeline */}
        <div className="space-y-6">
          {filteredPosts.map((post) => (
            <div
              key={post.id}
              className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden hover:border-gray-600 transition-colors"
            >
              <div className="p-6">
                {/* Post Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div className={`p-2 bg-gray-800 rounded-lg mr-3 ${platformColors[post.platform] || 'text-gray-400'}`}>
                      {getPlatformIcon(post.platform)}
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">{post.platform}</h3>
                      <p className="text-xs text-gray-400">
                        {format(new Date(post.postedAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                      </p>
                    </div>
                  </div>
                  {post.engagement && (
                    <div className="flex items-center text-green-400">
                      <TrendingUp className="h-4 w-4 mr-1" />
                      <span className="text-sm font-medium">{post.engagement}% Engagement</span>
                    </div>
                  )}
                </div>

                {/* Post Content */}
                <p className="text-gray-300 mb-4 whitespace-pre-wrap">{post.content}</p>

                {/* Media */}
                {post.mediaUrls && post.mediaUrls.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {post.mediaUrls.map((url, index) => (
                      <div key={index} className="aspect-square bg-gray-800 rounded-lg overflow-hidden">
                        <img
                          src={url}
                          alt={`Post media ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Engagement Stats */}
                <div className="flex items-center space-x-6 pt-4 border-t border-gray-700">
                  <div className="flex items-center text-gray-400">
                    <Heart className="h-5 w-5 mr-2" />
                    <span>{post.likes?.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center text-gray-400">
                    <Comment className="h-5 w-5 mr-2" />
                    <span>{post.comments?.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center text-gray-400">
                    <Share2 className="h-5 w-5 mr-2" />
                    <span>{post.shares?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Load More */}
        {filteredPosts.length > 0 && (
          <div className="mt-8 text-center">
            <button className="px-6 py-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors">
              Weitere Posts laden
            </button>
          </div>
        )}

        {filteredPosts.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">Keine Posts gefunden</h3>
            <p className="text-gray-500">Es gibt keine Posts für die ausgewählte Plattform.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SocialStream;
