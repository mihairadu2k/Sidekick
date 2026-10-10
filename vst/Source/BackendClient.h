#pragma once

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>

struct BackendTask
{
    juce::String taskId;
    juce::String status; // "queued", "fetching_info", "downloading", "converting", "completed", "error", "cancelled"
    float progress = 0.0f; // 0.0 to 100.0
    juce::String speed;
    juce::String eta;
    juce::String title;
    juce::String artist;
    juce::String filename;
    juce::String filePath;
    juce::String error;
    bool isFinished = false;
};

struct BackendFileItem
{
    juce::String id;
    juce::String title;
    juce::String artist;
    juce::String filename;
    juce::String filePath;
    juce::String durationStr;
    juce::String format;
    juce::String fileSizeMb;
};

class BackendClient : public juce::Timer
{
public:
    class Listener
    {
    public:
        virtual ~Listener() = default;
        virtual void backendConnectionChanged(bool isConnected) {}
        virtual void taskUpdated(const BackendTask& task) {}
        virtual void filesListUpdated(const juce::Array<BackendFileItem>& files) {}
        virtual void downloadStarted(const juce::String& taskId) {}
        virtual void downloadFailed(const juce::String& errorMessage) {}
    };

    BackendClient(const juce::String& baseUrl = "http://127.0.0.1:8000");
    ~BackendClient() override;

    void addListener(Listener* listener);
    void removeListener(Listener* listener);

    void setBaseUrl(const juce::String& url);
    juce::String getBaseUrl() const { return baseUrl; }
    bool isConnected() const { return connected; }

    void startDownload(const juce::String& youtubeUrl, const juce::String& quality = "320k",
                       const juce::String& customTitle = {}, const juce::String& customArtist = {});
    void refreshFilesList();
    void cancelCurrentTask();
    void stopAll();

    const BackendTask& getCurrentTask() const { return currentTask; }
    const juce::Array<BackendFileItem>& getRecentFiles() const { return recentFiles; }

private:
    void timerCallback() override;
    void performHealthCheck();
    void pollActiveTasks();
    void fetchFiles();

    juce::String baseUrl;
    bool connected = false;
    juce::String activeTaskId;
    BackendTask currentTask;
    juce::Array<BackendFileItem> recentFiles;
    juce::ListenerList<Listener> listeners;
    juce::ThreadPool threadPool { 2 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(BackendClient)
};
