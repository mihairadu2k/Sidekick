#include "BackendClient.h"

BackendClient::BackendClient(const juce::String& url)
    : baseUrl(url)
{
    startTimer(1000); // Check connection & poll tasks every 1 second
    performHealthCheck();
}

BackendClient::~BackendClient()
{
    stopTimer();
    threadPool.removeAllJobs(true, 1000);
}

void BackendClient::addListener(Listener* listener)
{
    listeners.add(listener);
}

void BackendClient::removeListener(Listener* listener)
{
    listeners.remove(listener);
}

void BackendClient::setBaseUrl(const juce::String& url)
{
    baseUrl = url;
    performHealthCheck();
}

void BackendClient::timerCallback()
{
    performHealthCheck();

    if (!activeTaskId.isEmpty())
    {
        pollActiveTasks();
    }
}

void BackendClient::performHealthCheck()
{
    threadPool.addJob([this]() {
        juce::URL url(baseUrl + "/api/health");
        auto options = juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inAddress)
                           .withConnectionTimeoutMs(1500)
                           .withNumRedirectsToFollow(2);
        auto stream = url.createInputStream(options);
        bool isOk = false;

        if (stream != nullptr)
        {
            auto response = stream->readEntireStreamAsString();
            auto json = juce::JSON::parse(response);
            if (json.isObject() && json["status"].toString() == "healthy")
            {
                isOk = true;
            }
        }

        juce::MessageManager::callAsync([this, isOk]() {
            if (connected != isOk)
            {
                connected = isOk;
                listeners.call([isOk](Listener& l) { l.backendConnectionChanged(isOk); });
            }
        });
    });
}

void BackendClient::startDownload(const juce::String& youtubeUrl, const juce::String& quality,
                                  const juce::String& customTitle, const juce::String& customArtist)
{
    if (youtubeUrl.trim().isEmpty())
        return;

    threadPool.addJob([this, youtubeUrl, quality, customTitle, customArtist]() {
        juce::DynamicObject::Ptr postObj = new juce::DynamicObject();
        postObj->setProperty("url", youtubeUrl.trim());
        postObj->setProperty("quality", quality.isNotEmpty() ? quality : "320k");
        if (customTitle.isNotEmpty())
            postObj->setProperty("custom_title", customTitle);
        if (customArtist.isNotEmpty())
            postObj->setProperty("custom_artist", customArtist);
        postObj->setProperty("embed_thumbnail", true);
        postObj->setProperty("embed_metadata", true);

        juce::MemoryOutputStream memStream;
        juce::JSON::writeToStream(memStream, juce::var(postObj.get()));
        juce::String jsonString = memStream.toString();

        juce::URL url(baseUrl + "/api/download");
        auto stream = url.withPOSTData(jsonString).createInputStream(
            juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inPostData)
                .withExtraHeaders("Content-Type: application/json\r\n")
                .withConnectionTimeoutMs(8000)
        );

        if (stream != nullptr)
        {
            auto response = stream->readEntireStreamAsString();
            auto json = juce::JSON::parse(response);
            if (json.isObject() && json.hasProperty("task_id"))
            {
                juce::String tId = json["task_id"].toString();
                juce::MessageManager::callAsync([this, tId]() {
                    activeTaskId = tId;
                    currentTask = BackendTask();
                    currentTask.taskId = tId;
                    currentTask.status = "queued";
                    currentTask.progress = 0.0f;
                    listeners.call([tId](Listener& l) { l.downloadStarted(tId); });
                    listeners.call([this](Listener& l) { l.taskUpdated(currentTask); });
                });
                return;
            }
        }

        juce::MessageManager::callAsync([this]() {
            listeners.call([](Listener& l) { l.downloadFailed("Failed to initiate download with backend."); });
        });
    });
}

void BackendClient::pollActiveTasks()
{
    threadPool.addJob([this]() {
        juce::URL url(baseUrl + "/api/tasks");
        auto options = juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inAddress)
                           .withConnectionTimeoutMs(2000);
        auto stream = url.createInputStream(options);

        if (stream != nullptr)
        {
            auto response = stream->readEntireStreamAsString();
            auto json = juce::JSON::parse(response);

            if (json.isArray())
            {
                auto* arr = json.getArray();
                bool foundActive = false;

                for (const auto& item : *arr)
                {
                    if (item["task_id"].toString() == activeTaskId)
                    {
                        foundActive = true;
                        BackendTask updatedTask;
                        updatedTask.taskId = activeTaskId;
                        updatedTask.status = item["status"].toString();
                        updatedTask.progress = static_cast<float>(static_cast<double>(item["progress"]));
                        updatedTask.speed = item["speed"].toString();
                        updatedTask.eta = item["eta"].toString();
                        updatedTask.title = item["title"].toString();
                        updatedTask.artist = item["artist"].toString();
                        updatedTask.filename = item["filename"].toString();
                        updatedTask.filePath = item["file_path"].toString();
                        updatedTask.error = item["error"].toString();

                        if (updatedTask.status == "completed")
                        {
                            updatedTask.isFinished = true;
                            activeTaskId = "";
                        }
                        else if (updatedTask.status == "error" || updatedTask.status == "cancelled")
                        {
                            updatedTask.isFinished = true;
                            activeTaskId = "";
                        }

                        juce::MessageManager::callAsync([this, updatedTask]() {
                            currentTask = updatedTask;
                            listeners.call([updatedTask](Listener& l) { l.taskUpdated(updatedTask); });
                            if (updatedTask.isFinished && updatedTask.status == "completed")
                            {
                                refreshFilesList();
                            }
                        });
                        break;
                    }
                }

                if (!foundActive && !activeTaskId.isEmpty())
                {
                    // Task may have been cleared or finished
                    refreshFilesList();
                }
            }
        }
    });
}

void BackendClient::refreshFilesList()
{
    threadPool.addJob([this]() {
        juce::URL url(baseUrl + "/api/files");
        auto options = juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inAddress)
                           .withConnectionTimeoutMs(3000);
        auto stream = url.createInputStream(options);

        if (stream != nullptr)
        {
            auto response = stream->readEntireStreamAsString();
            auto json = juce::JSON::parse(response);

            if (json.isArray())
            {
                juce::Array<BackendFileItem> list;
                for (const auto& item : *(json.getArray()))
                {
                    BackendFileItem fileItem;
                    fileItem.id = item["id"].toString();
                    fileItem.title = item["title"].toString();
                    fileItem.artist = item["artist"].toString();
                    fileItem.filename = item["filename"].toString();
                    fileItem.durationStr = item["duration_str"].toString();
                    fileItem.format = item["format"].toString();
                    fileItem.fileSizeMb = item["file_size_mb"].toString();
                    
                    // Construct local file path if backend is local
                    fileItem.filePath = (juce::File::getSpecialLocation(juce::File::userHomeDirectory)
                                            .getChildFile("Work/YT2MP3/downloads")
                                            .getChildFile(fileItem.filename)).getFullPathName();
                    if (!juce::File(fileItem.filePath).existsAsFile())
                    {
                        // Fallback check in current task file path dir
                        if (currentTask.filePath.isNotEmpty())
                        {
                            auto parentDir = juce::File(currentTask.filePath).getParentDirectory();
                            auto candidate = parentDir.getChildFile(fileItem.filename);
                            if (candidate.existsAsFile())
                                fileItem.filePath = candidate.getFullPathName();
                        }
                    }

                    list.add(fileItem);
                }

                juce::MessageManager::callAsync([this, list]() {
                    recentFiles = list;
                    listeners.call([list](Listener& l) { l.filesListUpdated(list); });
                });
            }
        }
    });
}

void BackendClient::cancelCurrentTask()
{
    if (activeTaskId.isEmpty())
        return;

    auto tId = activeTaskId;
    threadPool.addJob([this, tId]() {
        juce::URL url(baseUrl + "/api/tasks/" + tId + "/cancel");
        url.withPOSTData("").createInputStream(
            juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inPostData)
                .withConnectionTimeoutMs(2000)
        );
    });
    activeTaskId = "";
}

void BackendClient::stopAll()
{
    threadPool.addJob([this]() {
        juce::URL url(baseUrl + "/api/stop-all");
        url.withPOSTData("").createInputStream(
            juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inPostData)
                .withConnectionTimeoutMs(2000)
        );
    });
    activeTaskId = "";
}
