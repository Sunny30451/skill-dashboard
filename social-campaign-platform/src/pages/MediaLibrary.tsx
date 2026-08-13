import React from 'react';
import { FolderOpen, Upload, Image as ImageIcon, Video, FileText, Trash2, Download } from 'lucide-react';
import { mockMediaFiles } from '../mock-data';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const MediaLibrary: React.FC = () => {
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = React.useState<string>('all');

  const filteredFiles = filterType === 'all'
    ? mockMediaFiles
    : mockMediaFiles.filter(file => file.mimeType.startsWith(filterType));

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="h-8 w-8 text-blue-400" />;
    if (mimeType.startsWith('video/')) return <Video className="h-8 w-8 text-purple-400" />;
    if (mimeType.includes('pdf')) return <FileText className="h-8 w-8 text-red-400" />;
    return <FolderOpen className="h-8 w-8 text-gray-400" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-6 md:p-8 md:ml-64">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Mediathek</h1>
            <p className="text-gray-400">Verwalte alle deine Medien und Dateien</p>
          </div>
          <button className="mt-4 md:mt-0 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center">
            <Upload className="h-5 w-5 mr-2" />
            Datei hochladen
          </button>
        </div>

        {/* Filters and View Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filterType === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Alle
            </button>
            <button
              onClick={() => setFilterType('image')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filterType === 'image'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Bilder
            </button>
            <button
              onClick={() => setFilterType('video')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filterType === 'video'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Videos
            </button>
            <button
              onClick={() => setFilterType('application')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filterType === 'application'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Dokumente
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Liste
            </button>
          </div>
        </div>

        {/* Files Display */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden hover:border-blue-500 transition-colors group"
              >
                <div className="aspect-square bg-gray-800 flex items-center justify-center p-4">
                  {file.thumbnailUrl ? (
                    <img
                      src={file.thumbnailUrl}
                      alt={file.originalName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    getFileIcon(file.mimeType)
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-white font-medium text-sm truncate mb-1">{file.originalName}</h3>
                  <p className="text-xs text-gray-400 mb-2">{formatFileSize(file.size)}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {format(new Date(file.createdAt), 'dd.MM.yyyy', { locale: de })}
                    </span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="text-gray-400 hover:text-white">
                        <Download className="h-4 w-4" />
                      </button>
                      <button className="text-gray-400 hover:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Name</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Typ</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Größe</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Hochgeladen am</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-400">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => (
                  <tr key={file.id} className="border-b border-gray-700/50 hover:bg-gray-800/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="mr-3">
                          {getFileIcon(file.mimeType)}
                        </div>
                        <div>
                          <p className="text-white font-medium">{file.originalName}</p>
                          {file.tags && file.tags.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {file.tags.map((tag, i) => (
                                <span key={i} className="text-xs text-blue-400">#{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-sm">{file.mimeType}</td>
                    <td className="px-6 py-4 text-gray-400 text-sm">{formatFileSize(file.size)}</td>
                    <td className="px-6 py-4 text-gray-400 text-sm">
                      {format(new Date(file.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button className="text-gray-400 hover:text-white">
                          <Download className="h-4 w-4" />
                        </button>
                        <button className="text-gray-400 hover:text-red-400">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredFiles.length === 0 && (
          <div className="text-center py-12">
            <FolderOpen className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">Keine Dateien gefunden</h3>
            <p className="text-gray-500">Lade deine erste Datei in die Mediathek hoch.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaLibrary;
