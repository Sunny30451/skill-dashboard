import React from 'react';
import { 
  MessageSquare, 
  Heart, 
  Share2, 
  TrendingUp, 
  Video,
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
      case 'Instagram': return <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>;
      case 'Twitter/X': return <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
      case 'LinkedIn': return <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>;
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
                    <MessageSquare className="h-5 w-5 mr-2" />
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
