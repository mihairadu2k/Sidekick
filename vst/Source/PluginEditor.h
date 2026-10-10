#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include "PluginProcessor.h"
#include "DraggableWaveformComponent.h"
#include "BackendClient.h"

class YT2MP3AudioProcessorEditor : public juce::AudioProcessorEditor,
                                   public BackendClient::Listener,
                                   public juce::Timer
{
public:
    YT2MP3AudioProcessorEditor(YT2MP3AudioProcessor&);
    ~YT2MP3AudioProcessorEditor() override;

    void paint(juce::Graphics&) override;
    void resized() override;

    // BackendClient::Listener
    void backendConnectionChanged(bool isConnected) override;
    void taskUpdated(const BackendTask& task) override;
    void filesListUpdated(const juce::Array<BackendFileItem>& files) override;
    void downloadStarted(const juce::String& taskId) override;
    void downloadFailed(const juce::String& errorMessage) override;

    // juce::Timer
    void timerCallback() override;

private:
    YT2MP3AudioProcessor& audioProcessor;

    // Header Components
    juce::Label headerTitleLabel;
    juce::Label statusLabel;

    // Input Components
    juce::TextEditor urlEditor;
    juce::TextButton pasteButton { "Paste" };
    juce::ComboBox qualityComboBox;
    juce::TextButton convertButton { "DOWNLOAD" };

    // Progress & Status Display
    juce::ProgressBar progressBar;
    double progressValue = 0.0;
    juce::Label infoStatusLabel;

    // Waveform & Drag
    DraggableWaveformComponent waveformComponent;

    // Recent Files & Actions
    juce::ComboBox recentFilesComboBox;
    juce::TextButton openFolderButton { "Open Folder" };

    bool isConnected = false;
    juce::Array<BackendFileItem> currentFiles;

    void triggerDownload();
    void updateConnectionStatusUI();
    void loadSelectedFileIntoWaveform(int index);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(YT2MP3AudioProcessorEditor)
};
