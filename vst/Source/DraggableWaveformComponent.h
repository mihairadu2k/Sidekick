#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_audio_formats/juce_audio_formats.h>

class DraggableWaveformComponent : public juce::Component,
                                  public juce::ChangeListener,
                                  public juce::SettableTooltipClient
{
public:
    DraggableWaveformComponent(juce::AudioFormatManager& formatManager);
    ~DraggableWaveformComponent() override;

    void setAudioFile(const juce::File& file, const juce::String& title = {}, const juce::String& artist = {});
    void clear();

    void paint(juce::Graphics& g) override;
    void resized() override;

    void mouseEnter(const juce::MouseEvent& e) override;
    void mouseExit(const juce::MouseEvent& e) override;
    void mouseDown(const juce::MouseEvent& e) override;
    void mouseDrag(const juce::MouseEvent& e) override;
    void mouseUp(const juce::MouseEvent& e) override;

    void changeListenerCallback(juce::ChangeBroadcaster* source) override;

    std::function<void(const juce::File&, bool)> onPreviewToggle;

    bool hasFile() const { return currentAudioFile.existsAsFile(); }
    const juce::File& getCurrentFile() const { return currentAudioFile; }

    void setPlayingState(bool isPlaying);

private:
    juce::AudioFormatManager& formatManager;
    juce::AudioThumbnailCache thumbnailCache { 5 };
    juce::AudioThumbnail thumbnail;

    juce::File currentAudioFile;
    juce::String displayTitle;
    juce::String displayArtist;
    juce::String durationStr;

    bool isHovered = false;
    bool isDragging = false;
    bool isPlaying = false;
    juce::Point<int> dragStartPos;

    juce::ImageButton playButton;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(DraggableWaveformComponent)
};
